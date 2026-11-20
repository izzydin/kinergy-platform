import * as path from 'path';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  KnowledgeDocument,
  DocumentVersion,
  IngestionJob,
  VisibilityScope,
  IngestionStatus,
  IKnowledgeDocumentRepositoryPort,
  IIngestionJobRepositoryPort,
  DocumentNotFoundException,
  UnauthorizedDocumentAccessException,
} from '@kinergy-platform/core';
import {
  OBJECT_STORAGE_PORT,
  ObjectStoragePort,
} from '../../platform/storage/ports/object-storage.port';
import {
  KNOWLEDGE_DOCUMENT_REPOSITORY,
  INGESTION_JOB_REPOSITORY,
  DOCUMENT_CONTENT_VALIDATOR,
} from '../ai.tokens';
import { DocumentContentValidatorService } from './document-content-validator.service';
import { IngestionOrchestratorService } from './ingestion-orchestrator.service';

export interface UploadDocumentDto {
  tenantId: string;
  uploadedBy: string;
  file: {
    originalFileName: string;
    mimeType: string;
    buffer: Buffer;
    size: number;
  };
  title?: string;
  description?: string;
  visibilityScope?: VisibilityScope;
  documentId?: string;
  language?: string;
}

export interface UploadDocumentResult {
  documentId: string;
  versionId: string;
  versionNumber: number;
  title: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  checksum: string;
  visibilityScope: VisibilityScope;
  ingestionJobId: string;
  ingestionStatus: IngestionStatus;
  createdAt: Date;
}

@Injectable()
export class SecureDocumentUploadService {
  private readonly logger = new Logger(SecureDocumentUploadService.name);

  constructor(
    @Inject(OBJECT_STORAGE_PORT)
    private readonly storagePort: ObjectStoragePort,
    @Inject(KNOWLEDGE_DOCUMENT_REPOSITORY)
    private readonly documentRepo: IKnowledgeDocumentRepositoryPort,
    @Inject(INGESTION_JOB_REPOSITORY)
    private readonly ingestionJobRepo: IIngestionJobRepositoryPort,
    @Inject(DOCUMENT_CONTENT_VALIDATOR)
    private readonly contentValidator: DocumentContentValidatorService,
    @Optional()
    private readonly orchestrator?: IngestionOrchestratorService,
  ) {}

  /**
   * Orchestrates a secure, two-phase document upload workflow:
   * 1. Validates identity and tenant scoping.
   * 2. Inspects content, magic bytes, structure, security constraints, and calculates SHA-256.
   * 3. Checks for intra-document duplicate versions.
   * 4. Uploads to isolated tenant object storage (Phase 1).
   * 5. Atomically persists KnowledgeDocument, DocumentVersion, and IngestionJob (Phase 2).
   * 6. Executes compensating storage cleanup if database persistence fails.
   */
  public async uploadDocument(input: UploadDocumentDto): Promise<UploadDocumentResult> {
    const { tenantId, uploadedBy, file, documentId } = input;

    // 1. Identity & Tenant isolation enforcement
    if (!tenantId || tenantId.trim().length === 0) {
      throw new UnauthorizedDocumentAccessException('Tenant ID is required for document upload.');
    }
    if (!uploadedBy || uploadedBy.trim().length === 0) {
      throw new UnauthorizedDocumentAccessException(
        'UploadedBy identity is required for document upload.',
      );
    }

    // 2. Content validation & deep inspection
    const validated = this.contentValidator.validate({
      buffer: file.buffer,
      originalFileName: file.originalFileName,
      declaredMimeType: file.mimeType,
    });

    // 3. Pre-check existing document if adding a version
    let existingDoc: KnowledgeDocument | null = null;
    if (documentId) {
      existingDoc = await this.documentRepo.findById(tenantId, documentId);
      if (!existingDoc) {
        throw new DocumentNotFoundException(documentId);
      }
      // Domain invariant: checks if checksum already exists in any version of this document
      const versions = existingDoc.getAllVersions();
      const alreadyHasVersion = versions.some(
        (v: DocumentVersion) => v.checksum === validated.checksum,
      );
      if (alreadyHasVersion) {
        const existingVer = versions.find(
          (v: DocumentVersion) => v.checksum === validated.checksum,
        );
        throw new (await import('@kinergy-platform/core')).DuplicateDocumentVersionException(
          validated.checksum,
          existingVer!.versionNumber,
        );
      }
    }

    // 4. Phase 1: Upload to backing store with tenant partition
    const storedObject = await this.storagePort.upload(
      tenantId,
      'knowledge_base',
      validated.safeFileName,
      file.buffer,
      validated.canonicalMimeType,
    );

    const storageKey = storedObject.key;

    // 5. Phase 2: Atomic database persistence with compensating rollback
    try {
      let savedDoc: KnowledgeDocument;
      let targetVersion: DocumentVersion;

      if (existingDoc) {
        targetVersion = existingDoc.addVersion({
          originalFileName: file.originalFileName,
          mimeType: validated.canonicalMimeType,
          fileSize: validated.sizeBytes,
          checksum: validated.checksum,
          storageKey,
          uploadedBy,
          language: input.language,
        });

        savedDoc = await this.documentRepo.save(existingDoc);
      } else {
        const title = input.title?.trim() || this.inferTitleFromFilename(file.originalFileName);

        savedDoc = KnowledgeDocument.create({
          tenantId,
          title,
          description: input.description?.trim(),
          visibilityScope: input.visibilityScope ?? VisibilityScope.ALL_STAFF,
          uploadedBy,
          initialVersion: {
            originalFileName: file.originalFileName,
            mimeType: validated.canonicalMimeType,
            fileSize: validated.sizeBytes,
            checksum: validated.checksum,
            storageKey,
            uploadedBy,
            language: input.language,
          },
        });

        savedDoc = await this.documentRepo.save(savedDoc);
        const current = savedDoc.getCurrentVersion();
        if (!current) {
          throw new Error('Initial document version missing after save.');
        }
        targetVersion = current;
      }

      // 6. Create initial IngestionJob in UPLOADED state
      const ingestionJob = IngestionJob.create({
        tenantId,
        documentId: savedDoc.id.toString(),
        documentVersionId: targetVersion.id,
        maxAttempts: 3,
      });

      await this.ingestionJobRepo.save(ingestionJob);

      // Trigger asynchronous background ingestion lifecycle orchestration without blocking the HTTP response
      if (this.orchestrator) {
        setImmediate(() => {
          this.orchestrator!.processJob(ingestionJob.id, tenantId).catch((err) => {
            this.logger.error(
              `Background ingestion job execution failed for job '${ingestionJob.id}': ${err}`,
            );
          });
        });
      }

      this.logger.log(
        `Successfully uploaded document '${savedDoc.id}' v${targetVersion.versionNumber} for tenant '${tenantId}'. IngestionJob '${ingestionJob.id}' initiated.`,
      );

      // Return sanitized metadata (never exposing internal storage keys)
      return {
        documentId: savedDoc.id.toString(),
        versionId: targetVersion.id,
        versionNumber: targetVersion.versionNumber,
        title: savedDoc.title,
        originalFileName: targetVersion.originalFileName,
        mimeType: targetVersion.mimeType,
        fileSize: targetVersion.fileSize,
        checksum: targetVersion.checksum,
        visibilityScope: savedDoc.visibilityScope,
        ingestionJobId: ingestionJob.id,
        ingestionStatus: ingestionJob.status,
        createdAt: targetVersion.createdAt,
      };
    } catch (persistError) {
      // Compensating Transaction: Cleanup orphan storage file on DB persistence failure
      this.logger.warn(
        `Database persistence failed after storing object '${storageKey}'. Triggering compensating storage deletion.`,
      );

      try {
        await this.storagePort.delete(tenantId, storageKey);
        this.logger.log(`Compensating deletion succeeded for orphaned key '${storageKey}'.`);
      } catch (cleanupError) {
        this.logger.error(
          `Compensating storage delete FAILED for orphaned key '${storageKey}' in tenant '${tenantId}': ${cleanupError}`,
        );
      }

      throw persistError;
    }
  }

  private inferTitleFromFilename(filename: string): string {
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    return base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled Document';
  }
}
