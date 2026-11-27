import * as path from 'path';
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Res,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  UseFilters,
  HttpCode,
  HttpStatus,
  HttpException,
  BadRequestException,
  UnauthorizedException,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Inject,
  Optional,
} from '@nestjs/common';
import { IngestionOrchestratorService } from '../services/ingestion-orchestrator.service';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiConsumes,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  DocumentValidationException,
  DocumentSizeLimitExceededException,
  DocumentSecurityRiskException,
  UnsupportedDocumentFormatException,
  DuplicateDocumentVersionException,
  DuplicateDocumentContentException,
  DocumentNotFoundException,
  DocumentAlreadyDeletedException,
  UnauthorizedDocumentAccessException,
  InvalidStateTransitionException,
  InvalidIngestionRetryException,
  IngestionJobCancellationConflictException,
  IKnowledgeDocumentRepositoryPort,
  IIngestionJobRepositoryPort,
  KnowledgeDocument,
  DocumentVersion,
  IngestionJob,
  VisibilityScope,
  IngestionStatus,
  AiResourceAuthorizationPolicy,
} from '@kinergy-platform/core';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { RequirePermissions } from '../../platform/identity/authorization/decorators/permissions.decorator';
import { PERMISSIONS } from '../../platform/identity/authorization/permissions';
import {
  CurrentUser,
  AuthenticatedUserPayload,
} from '../../platform/identity/decorators/current-user.decorator';
import {
  OBJECT_STORAGE_PORT,
  ObjectStoragePort,
} from '../../platform/storage/ports/object-storage.port';
import {
  KNOWLEDGE_DOCUMENT_REPOSITORY,
  INGESTION_JOB_REPOSITORY,
  SECURE_DOCUMENT_UPLOAD_SERVICE,
  VECTOR_CLEANUP_SERVICE,
  RETRIEVAL_SECURITY_POLICY_SERVICE,
  INGESTION_OBSERVABILITY_SERVICE,
} from '../ai.tokens';
import { VectorCleanupService } from '../services/indexing/vector-cleanup.service';
import { SecureDocumentUploadService } from '../services/secure-document-upload.service';
import { RetrievalSecurityPolicyService } from '../services/retrieval/retrieval-security-policy.service';
import { IngestionObservabilityService } from '../services/ingestion-observability.service';
import { IngestionErrorCode } from '../services/ingestion-retry.policy';
import { IngestionRetrievalStatusDto } from './dtos/ingestion-observability.dto';
import {
  UploadDocumentRequestDto,
  UploadDocumentResponseDto,
  UpdateDocumentMetadataRequestDto,
  ListDocumentsQueryDto,
  DocumentDetailResponseDto,
  DocumentVersionResponseDto,
  PaginatedDocumentsResponseDto,
  IngestionJobResponseDto,
  CancelIngestionJobRequestDto,
  DocumentPreviewMetadataResponseDto,
  KnowledgeCapabilitiesResponseDto,
} from './dtos/ai-document.dto';
import { AiExceptionFilter } from '../filters/ai-exception.filter';

interface MulterUploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/**
 * Strict Multer options for AI Knowledge Document uploads conforming to AI-10.3-FILE-SECURITY-POLICY:
 * - fileSize: 10 MB (10,485,760 bytes)
 * - files: 1 (single-file constraint)
 * - fields: 10 (bounded multipart form fields)
 * - parts: 15 (bounded multipart components to prevent DoS)
 */
export const KNOWLEDGE_DOCUMENT_UPLOAD_MULTER_OPTIONS = {
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB maximum
    files: 1, // Single file only
    fields: 10,
    parts: 15,
  },
};

@ApiTags('AI - Knowledge Documents')
@ApiBearerAuth()
@Controller(['api/v1/ai/knowledge/documents', 'api/v1/ai/documents'])
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@UseFilters(AiExceptionFilter)
export class AiDocumentController {
  private readonly resourcePolicy = new AiResourceAuthorizationPolicy();

  constructor(
    @Inject(SECURE_DOCUMENT_UPLOAD_SERVICE)
    private readonly uploadService: SecureDocumentUploadService,
    @Inject(KNOWLEDGE_DOCUMENT_REPOSITORY)
    private readonly documentRepo: IKnowledgeDocumentRepositoryPort,
    @Inject(INGESTION_JOB_REPOSITORY)
    private readonly ingestionJobRepo: IIngestionJobRepositoryPort,
    @Inject(OBJECT_STORAGE_PORT)
    private readonly storagePort: ObjectStoragePort,
    @Optional()
    private readonly orchestrator?: IngestionOrchestratorService,
    @Optional()
    @Inject(VECTOR_CLEANUP_SERVICE)
    private readonly cleanupService?: VectorCleanupService,
    @Optional()
    @Inject(RETRIEVAL_SECURITY_POLICY_SERVICE)
    private readonly securityPolicy?: RetrievalSecurityPolicyService,
    @Optional()
    @Inject(INGESTION_OBSERVABILITY_SERVICE)
    private readonly observabilityService?: IngestionObservabilityService,
  ) {}

  /**
   * 1. POST /api/v1/ai/knowledge/documents
   * Upload a new knowledge document with its initial version.
   */
  @Post()
  @RequirePermissions(PERMISSIONS.AI.DOCUMENTS_UPLOAD)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', KNOWLEDGE_DOCUMENT_UPLOAD_MULTER_OPTIONS))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a new knowledge document',
    description:
      'Accepts PDF, DOCX, Markdown, or Plain Text. Validates content magic bytes, structure, and calculates SHA-256.',
  })
  @ApiResponse({ status: 201, type: UploadDocumentResponseDto })
  @ApiResponse({
    status: 400,
    description: 'File validation failed (malformed, oversized, or MIME mismatch)',
  })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 409, description: 'Duplicate document version detected' })
  async uploadDocument(
    @CurrentUser() user: AuthenticatedUserPayload | null,
    @UploadedFile() file: MulterUploadedFile | undefined,
    @Body() dto: UploadDocumentRequestDto,
  ): Promise<UploadDocumentResponseDto> {
    const { tenantId, userId } = this.extractAuthContext(user);

    if (!file || !file.buffer) {
      throw new BadRequestException('A file is required for document upload.');
    }

    if (dto?.visibilityScope && this.securityPolicy && user?.roles && user.roles.length > 0) {
      const allowedScopes = this.securityPolicy.resolveAllowedVisibilityScopes(user.roles);
      if (!allowedScopes.includes(dto.visibilityScope)) {
        throw new ForbiddenException(
          `You do not have the required role clearance to assign visibility scope '${dto.visibilityScope}'.`,
        );
      }
    }

    try {
      const result = await this.uploadService.uploadDocument({
        tenantId,
        uploadedBy: userId,
        file: {
          originalFileName: file.originalname,
          mimeType: file.mimetype,
          buffer: file.buffer,
          size: file.size,
        },
        title: dto?.title,
        description: dto?.description,
        visibilityScope: dto?.visibilityScope,
        language: dto?.language,
      });

      return {
        ...result,
        createdAt: result.createdAt.toISOString(),
      };
    } catch (err: unknown) {
      this.translateDomainException(err);
    }
  }

  /**
   * 2. GET /api/v1/ai/knowledge/documents
   * List documents with server-side pagination and filters.
   */
  @Get()
  @ApiOperation({
    summary: 'List knowledge documents',
    description:
      'Returns tenant-scoped, paginated documents with filtering by search, MIME type, scope, and date bounds.',
  })
  @ApiResponse({ status: 200, type: PaginatedDocumentsResponseDto })
  async listDocuments(
    @CurrentUser() user: AuthenticatedUserPayload | null,
    @Query() query: ListDocumentsQueryDto,
  ): Promise<PaginatedDocumentsResponseDto> {
    const { tenantId } = this.extractAuthContext(user);

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 20));
    const offset = (page - 1) * limit;

    let allowedScopes: VisibilityScope[] | undefined;
    if (this.securityPolicy && user?.roles && user.roles.length > 0) {
      allowedScopes = this.securityPolicy.resolveAllowedVisibilityScopes(user.roles);
    } else {
      allowedScopes = [VisibilityScope.ALL_STAFF];
    }

    const isManager = this.canUserManageDocument(user, undefined);
    const includeDeleted = isManager ? (query.includeDeleted ?? false) : false;

    if (query.visibilityScope && allowedScopes && !allowedScopes.includes(query.visibilityScope)) {
      return {
        items: [],
        page,
        limit,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: false,
        data: [],
      };
    }

    const filter = {
      includeDeleted,
      search: query.search?.trim(),
      visibilityScope: query.visibilityScope,
      visibilityScopes: allowedScopes,
      mimeType: query.mimeType?.trim(),
      uploadedBy: query.uploadedBy?.trim(),
      createdFrom: query.createdFrom ? new Date(query.createdFrom) : undefined,
      createdTo: query.createdTo ? new Date(query.createdTo) : undefined,
      limit,
      offset,
      orderBy: query.orderBy || 'createdAt',
      orderDirection: query.orderDirection || 'desc',
    };

    const [docs, total] = await Promise.all([
      this.documentRepo.findAll(tenantId, filter),
      this.documentRepo.count(tenantId, filter),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    const items = await Promise.all(
      docs.map(async (doc) => {
        let latestStatus: IngestionStatus | undefined;
        const currentVer = doc.getCurrentVersion();
        if (currentVer) {
          const jobs = await this.ingestionJobRepo.findByVersionId(tenantId, currentVer.id);
          if (jobs.length > 0) {
            latestStatus = jobs[jobs.length - 1]?.status;
          }
        }
        return this.toDocumentDetailDto(doc, latestStatus);
      }),
    );

    return {
      items,
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
      data: items,
    };
  }

  /**
   * 2b. GET /api/v1/ai/knowledge/documents/capabilities
   * Authoritative capabilities contract for Knowledge Center uploads and formats.
   */
  @Get('capabilities')
  @ApiOperation({
    summary: 'Get document management upload capabilities and constraints',
    description:
      'Authoritative contract exposing maximum file size, permitted MIME types, file extensions, and visibility scopes.',
  })
  @ApiResponse({ status: 200, type: KnowledgeCapabilitiesResponseDto })
  getCapabilities(): KnowledgeCapabilitiesResponseDto {
    return {
      maxFileSizeBytes: 10 * 1024 * 1024,
      maxFileSizeMb: 10,
      allowedMimeTypes: [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/markdown',
        'text/plain',
      ],
      allowedExtensions: ['.pdf', '.docx', '.md', '.markdown', '.txt'],
      supportedVisibilityScopes: [
        VisibilityScope.ALL_STAFF,
        VisibilityScope.CLINICAL_STAFF,
        VisibilityScope.MANAGEMENT,
      ],
    };
  }

  /**
   * 3. GET /api/v1/ai/knowledge/documents/:id
   * Retrieve single document metadata with version summary.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get document details and version history' })
  @ApiParam({ name: 'id', description: 'Logical Knowledge Document ID' })
  @ApiResponse({ status: 200, type: DocumentDetailResponseDto })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async getDocument(
    @Param('id') documentId: string,
    @CurrentUser() user: AuthenticatedUserPayload | null,
    @Query('includeDeleted') includeDeleted?: string | boolean,
  ): Promise<DocumentDetailResponseDto> {
    const { tenantId } = this.extractAuthContext(user);

    const doc = await this.documentRepo.findById(tenantId, documentId);
    if (!doc) {
      throw new NotFoundException(`Knowledge document '${documentId}' was not found.`);
    }

    if (this.securityPolicy && user?.roles && user.roles.length > 0) {
      const allowedScopes = this.securityPolicy.resolveAllowedVisibilityScopes(user.roles);
      if (!allowedScopes.includes(doc.visibilityScope)) {
        throw new ForbiddenException(
          'You do not have the required role clearance to access or download this document.',
        );
      }
    }

    const shouldIncludeDeleted =
      includeDeleted === true || includeDeleted === 'true' || includeDeleted === '1';

    if (doc.isDeleted()) {
      if (!shouldIncludeDeleted) {
        throw new NotFoundException(`Knowledge document '${documentId}' was not found.`);
      }
      const isManager = this.canUserManageDocument(user, doc);
      if (!isManager) {
        throw new NotFoundException(`Knowledge document '${documentId}' was not found.`);
      }
    }

    let latestStatus: IngestionStatus | undefined;
    const currentVer = doc.getCurrentVersion();
    if (currentVer) {
      const jobs = await this.ingestionJobRepo.findByVersionId(tenantId, currentVer.id);
      if (jobs.length > 0) {
        latestStatus = jobs[jobs.length - 1]?.status;
      }
    }

    return this.toDocumentDetailDto(doc, latestStatus);
  }

  /**
   * 4. PATCH /api/v1/ai/knowledge/documents/:id
   * Update mutable metadata fields (title, description, visibilityScope).
   */
  @Patch(':id')
  @ApiOperation({
    summary: 'Update document metadata',
    description:
      'Modifies mutable attributes: title, description, or visibilityScope. Binary data and checksums cannot be modified.',
  })
  @ApiParam({ name: 'id', description: 'Logical Knowledge Document ID' })
  @ApiResponse({ status: 200, type: DocumentDetailResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid metadata or empty title' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async updateDocumentMetadata(
    @Param('id') documentId: string,
    @CurrentUser() user: AuthenticatedUserPayload | null,
    @Body() dto: UpdateDocumentMetadataRequestDto,
  ): Promise<DocumentDetailResponseDto> {
    const { tenantId } = this.extractAuthContext(user);

    const doc = await this.documentRepo.findById(tenantId, documentId);
    if (!doc || doc.isDeleted()) {
      throw new NotFoundException(`Knowledge document '${documentId}' was not found.`);
    }

    if (this.securityPolicy && user?.roles && user.roles.length > 0) {
      const allowedScopes = this.securityPolicy.resolveAllowedVisibilityScopes(user.roles);
      if (!allowedScopes.includes(doc.visibilityScope)) {
        throw new ForbiddenException(
          'You do not have the required role clearance to access or download this document.',
        );
      }
    }

    this.assertCanManageDocument(user, doc);

    try {
      if (dto.title !== undefined || dto.description !== undefined) {
        doc.updateMetadata(dto.title ?? doc.title, dto.description);
      }

      if (dto.visibilityScope !== undefined) {
        if (this.securityPolicy && user?.roles && user.roles.length > 0) {
          const allowedScopes = this.securityPolicy.resolveAllowedVisibilityScopes(user.roles);
          if (!allowedScopes.includes(dto.visibilityScope)) {
            throw new ForbiddenException(
              `You do not have the required role clearance to assign visibility scope '${dto.visibilityScope}'.`,
            );
          }
        }
        doc.changeVisibilityScope(dto.visibilityScope);
      }

      const updated = await this.documentRepo.save(doc);

      let latestStatus: IngestionStatus | undefined;
      const currentVer = updated.getCurrentVersion();
      if (currentVer) {
        const jobs = await this.ingestionJobRepo.findByVersionId(tenantId, currentVer.id);
        if (jobs.length > 0) {
          latestStatus = jobs[jobs.length - 1]?.status;
        }
      }

      return this.toDocumentDetailDto(updated, latestStatus);
    } catch (err: unknown) {
      this.translateDomainException(err);
    }
  }

  /**
   * 5. DELETE /api/v1/ai/knowledge/documents/:id
   * Soft-deletes a knowledge document. Preserves source files under retention policy.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft-delete a knowledge document',
    description:
      'Marks document as deleted. Preserves historical versions and source files without immediate physical destruction.',
  })
  @ApiParam({ name: 'id', description: 'Logical Knowledge Document ID' })
  @ApiResponse({ status: 204, description: 'Document soft-deleted successfully' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async deleteDocument(
    @Param('id') documentId: string,
    @CurrentUser() user: AuthenticatedUserPayload | null,
  ): Promise<void> {
    const { tenantId, userId } = this.extractAuthContext(user);

    const doc = await this.documentRepo.findById(tenantId, documentId);
    if (!doc || doc.isDeleted()) {
      throw new NotFoundException(`Knowledge document '${documentId}' was not found.`);
    }

    if (this.securityPolicy && user?.roles && user.roles.length > 0) {
      const allowedScopes = this.securityPolicy.resolveAllowedVisibilityScopes(user.roles);
      if (!allowedScopes.includes(doc.visibilityScope)) {
        throw new ForbiddenException(
          'You do not have the required role clearance to access or download this document.',
        );
      }
    }

    this.assertCanManageDocument(user, doc);

    try {
      doc.softDelete(userId);
      await this.documentRepo.save(doc);

      // AI-05.6: Purge vectors and cancel active indexing jobs for deleted document
      if (this.cleanupService) {
        await this.cleanupService.cleanupDocumentVectors(tenantId, documentId);
      }
    } catch (err: unknown) {
      this.translateDomainException(err);
    }
  }

  /**
   * 5b. POST /api/v1/ai/knowledge/documents/:id/restore
   * Restore a soft-deleted knowledge document back to ACTIVE status.
   */
  @Post(':id/restore')
  @RequirePermissions(PERMISSIONS.AI.DOCUMENTS_MANAGE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Restore a soft-deleted knowledge document',
    description:
      'Restores a previously soft-deleted document back to ACTIVE status and enqueues re-indexing for its active version.',
  })
  @ApiParam({ name: 'id', description: 'Logical Knowledge Document ID' })
  @ApiResponse({ status: 200, type: DocumentDetailResponseDto })
  @ApiResponse({ status: 400, description: 'Document is not deleted' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async restoreDocument(
    @Param('id') documentId: string,
    @CurrentUser() user: AuthenticatedUserPayload | null,
  ): Promise<DocumentDetailResponseDto> {
    const { tenantId } = this.extractAuthContext(user);

    const doc = await this.documentRepo.findById(tenantId, documentId);
    if (!doc) {
      throw new NotFoundException(`Knowledge document '${documentId}' was not found.`);
    }

    if (!doc.isDeleted()) {
      throw new BadRequestException(`Knowledge document '${documentId}' is not deleted.`);
    }

    this.assertCanManageDocument(user, doc);

    if (this.securityPolicy && user?.roles && user.roles.length > 0) {
      const allowedScopes = this.securityPolicy.resolveAllowedVisibilityScopes(user.roles);
      if (!allowedScopes.includes(doc.visibilityScope)) {
        throw new ForbiddenException(
          'You do not have the required role clearance to restore this document.',
        );
      }
    }

    try {
      doc.restore();
      await this.documentRepo.save(doc);

      let latestStatus: IngestionStatus | undefined;
      const currentVer = doc.getCurrentVersion();
      if (currentVer) {
        const newJob = IngestionJob.create({
          tenantId,
          documentId: doc.id.value,
          documentVersionId: currentVer.id,
        });
        await this.ingestionJobRepo.save(newJob);
        latestStatus = newJob.status;

        if (this.orchestrator) {
          setImmediate(() => {
            this.orchestrator!.processJob(newJob.id, tenantId).catch(() => {});
          });
        }
      }

      return this.toDocumentDetailDto(doc, latestStatus);
    } catch (err: unknown) {
      this.translateDomainException(err);
    }
  }

  /**
   * 6. GET /api/v1/ai/knowledge/documents/:id/versions
   * Retrieve all immutable versions for a document.
   */
  @Get(':id/versions')
  @ApiOperation({ summary: 'List all historical versions of a document' })
  @ApiParam({ name: 'id', description: 'Logical Knowledge Document ID' })
  @ApiResponse({ status: 200, type: [DocumentVersionResponseDto] })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async getDocumentVersions(
    @Param('id') documentId: string,
    @CurrentUser() user: AuthenticatedUserPayload | null,
  ): Promise<DocumentVersionResponseDto[]> {
    const { tenantId } = this.extractAuthContext(user);

    const doc = await this.documentRepo.findById(tenantId, documentId);
    if (!doc || doc.isDeleted()) {
      throw new NotFoundException(`Knowledge document '${documentId}' was not found.`);
    }

    if (this.securityPolicy && user?.roles && user.roles.length > 0) {
      const allowedScopes = this.securityPolicy.resolveAllowedVisibilityScopes(user.roles);
      if (!allowedScopes.includes(doc.visibilityScope)) {
        throw new ForbiddenException(
          'You do not have the required role clearance to access or download this document.',
        );
      }
    }

    return doc.getAllVersions().map((v) => this.toVersionDto(v));
  }

  /**
   * 7. GET /api/v1/ai/knowledge/documents/:id/versions/:versionId
   * Retrieve metadata for a specific document version.
   */
  @Get(':id/versions/:versionId')
  @ApiOperation({ summary: 'Get specific version metadata' })
  @ApiParam({ name: 'id', description: 'Logical Knowledge Document ID' })
  @ApiParam({ name: 'versionId', description: 'Version ID' })
  @ApiResponse({ status: 200, type: DocumentVersionResponseDto })
  @ApiResponse({ status: 404, description: 'Document or version not found' })
  async getSpecificVersion(
    @Param('id') documentId: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthenticatedUserPayload | null,
  ): Promise<DocumentVersionResponseDto> {
    const { tenantId } = this.extractAuthContext(user);

    const doc = await this.documentRepo.findById(tenantId, documentId);
    if (!doc || doc.isDeleted()) {
      throw new NotFoundException(`Knowledge document '${documentId}' was not found.`);
    }

    if (this.securityPolicy && user?.roles && user.roles.length > 0) {
      const allowedScopes = this.securityPolicy.resolveAllowedVisibilityScopes(user.roles);
      if (!allowedScopes.includes(doc.visibilityScope)) {
        throw new ForbiddenException(
          'You do not have the required role clearance to access or download this document.',
        );
      }
    }

    const version = doc.getVersionById(versionId);
    if (!version) {
      throw new NotFoundException(
        `Version '${versionId}' was not found in document '${documentId}'.`,
      );
    }

    return this.toVersionDto(version);
  }

  /**
   * 8. POST /api/v1/ai/knowledge/documents/:id/versions
   * Upload a subsequent version to an existing document.
   */
  @Post(':id/versions')
  @RequirePermissions(PERMISSIONS.AI.DOCUMENTS_UPLOAD)
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file', KNOWLEDGE_DOCUMENT_UPLOAD_MULTER_OPTIONS))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload a subsequent version for an existing document',
    description:
      'Increments version number and creates an ingestion job while preserving earlier versions.',
  })
  @ApiParam({ name: 'id', description: 'Target logical document ID' })
  @ApiResponse({ status: 201, type: UploadDocumentResponseDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  @ApiResponse({ status: 409, description: 'Duplicate version content' })
  async uploadVersion(
    @Param('id') documentId: string,
    @CurrentUser() user: AuthenticatedUserPayload | null,
    @UploadedFile() file: MulterUploadedFile | undefined,
    @Body() dto: UploadDocumentRequestDto,
  ): Promise<UploadDocumentResponseDto> {
    const { tenantId, userId } = this.extractAuthContext(user);

    if (!file || !file.buffer) {
      throw new BadRequestException('A file is required for document version upload.');
    }

    const doc = await this.documentRepo.findById(tenantId, documentId);
    if (!doc || doc.isDeleted()) {
      throw new NotFoundException(`Knowledge document '${documentId}' was not found.`);
    }

    if (this.securityPolicy && user?.roles && user.roles.length > 0) {
      const allowedScopes = this.securityPolicy.resolveAllowedVisibilityScopes(user.roles);
      if (!allowedScopes.includes(doc.visibilityScope)) {
        throw new ForbiddenException(
          'You do not have the required role clearance to access or download this document.',
        );
      }
    }

    this.assertCanManageDocument(user, doc);

    if (dto?.visibilityScope && this.securityPolicy && user?.roles && user.roles.length > 0) {
      const allowedScopes = this.securityPolicy.resolveAllowedVisibilityScopes(user.roles);
      if (!allowedScopes.includes(dto.visibilityScope)) {
        throw new ForbiddenException(
          `You do not have the required role clearance to assign visibility scope '${dto.visibilityScope}'.`,
        );
      }
    }

    try {
      const result = await this.uploadService.uploadDocument({
        tenantId,
        uploadedBy: userId,
        documentId,
        file: {
          originalFileName: file.originalname,
          mimeType: file.mimetype,
          buffer: file.buffer,
          size: file.size,
        },
        title: dto?.title,
        description: dto?.description,
        visibilityScope: dto?.visibilityScope,
        language: dto?.language,
      });

      return {
        ...result,
        createdAt: result.createdAt.toISOString(),
      };
    } catch (err: unknown) {
      this.translateDomainException(err);
    }
  }

  /**
   * 9. GET /api/v1/ai/knowledge/documents/:id/content
   * Authorized file content stream / download for current version (or specified version).
   */
  @Get(':id/content')
  @ApiOperation({ summary: 'Download document content' })
  @ApiParam({ name: 'id', description: 'Logical Knowledge Document ID' })
  @ApiQuery({ name: 'versionId', required: false, description: 'Optional specific version ID' })
  @ApiQuery({
    name: 'versionNumber',
    required: false,
    description: 'Optional specific version number',
  })
  @ApiResponse({ status: 200, description: 'Binary stream of document payload' })
  @ApiResponse({ status: 404, description: 'Document or version not found' })
  async downloadContent(
    @Param('id') documentId: string,
    @Query('versionId') versionId: string | undefined,
    @Query('versionNumber') versionNumber: string | undefined,
    @CurrentUser() user: AuthenticatedUserPayload | null,
    @Res() res: Response,
  ): Promise<void> {
    const { tenantId } = this.extractAuthContext(user);

    const doc = await this.documentRepo.findById(tenantId, documentId);
    if (!doc || doc.isDeleted()) {
      throw new NotFoundException(`Knowledge document '${documentId}' was not found.`);
    }

    if (this.securityPolicy && user?.roles && user.roles.length > 0) {
      const allowedScopes = this.securityPolicy.resolveAllowedVisibilityScopes(user.roles);
      if (!allowedScopes.includes(doc.visibilityScope)) {
        throw new ForbiddenException(
          'You do not have the required role clearance to access or download this document.',
        );
      }
    }

    let targetVersion: DocumentVersion | undefined;

    if (versionId) {
      targetVersion = doc.getVersionById(versionId);
    } else if (versionNumber) {
      targetVersion = doc.getVersion(Number(versionNumber));
    } else {
      targetVersion = doc.getCurrentVersion();
    }

    if (!targetVersion) {
      throw new NotFoundException(`Requested version was not found for document '${documentId}'.`);
    }

    const { data } = await this.storagePort.download(tenantId, targetVersion.storageKey);

    res.setHeader('Content-Type', targetVersion.mimeType);
    res.setHeader('Content-Length', targetVersion.fileSize);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(targetVersion.originalFileName)}"`,
    );
    res.setHeader('ETag', `"${targetVersion.checksum}"`);

    res.send(data);
  }

  /**
   * 10. GET /api/v1/ai/knowledge/documents/:id/versions/:versionId/content
   * Download content of a specific historical version.
   */
  @Get(':id/versions/:versionId/content')
  @ApiOperation({ summary: 'Download specific version content' })
  @ApiParam({ name: 'id', description: 'Logical Knowledge Document ID' })
  @ApiParam({ name: 'versionId', description: 'Version ID' })
  @ApiResponse({ status: 200, description: 'Binary stream of document payload' })
  @ApiResponse({ status: 404, description: 'Document or version not found' })
  async downloadVersionContent(
    @Param('id') documentId: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthenticatedUserPayload | null,
    @Res() res: Response,
  ): Promise<void> {
    return this.downloadContent(documentId, versionId, undefined, user, res);
  }

  /**
   * 10b. GET /api/v1/ai/knowledge/documents/:id/preview-metadata
   * Preview metadata for document viewer and source citation resolution.
   */
  @Get(':id/preview-metadata')
  @ApiOperation({ summary: 'Get document preview metadata and access state' })
  @ApiParam({ name: 'id', description: 'Logical Knowledge Document ID' })
  @ApiQuery({ name: 'versionId', required: false, description: 'Optional specific version ID' })
  @ApiQuery({
    name: 'versionNumber',
    required: false,
    description: 'Optional specific version number',
  })
  @ApiResponse({ status: 200, type: DocumentPreviewMetadataResponseDto })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async getPreviewMetadata(
    @Param('id') documentId: string,
    @Query('versionId') versionId: string | undefined,
    @Query('versionNumber') versionNumber: string | undefined,
    @CurrentUser() user: AuthenticatedUserPayload | null,
  ): Promise<DocumentPreviewMetadataResponseDto> {
    const { tenantId } = this.extractAuthContext(user);

    const doc = await this.documentRepo.findById(tenantId, documentId);
    if (!doc) {
      throw new NotFoundException(`Knowledge document '${documentId}' was not found.`);
    }

    let isAuthorized = doc.visibilityScope === VisibilityScope.ALL_STAFF;
    if (this.securityPolicy && user?.roles && user.roles.length > 0) {
      const allowedScopes = this.securityPolicy.resolveAllowedVisibilityScopes(user.roles);
      isAuthorized = allowedScopes.includes(doc.visibilityScope);
    }

    if (!isAuthorized) {
      throw new ForbiddenException(
        'You do not have the required role clearance to access or preview this document.',
      );
    }

    let targetVersion: DocumentVersion | undefined;
    if (versionId) {
      targetVersion = doc.getVersionById(versionId);
    } else if (versionNumber) {
      targetVersion = doc.getVersion(Number(versionNumber));
    } else {
      targetVersion = doc.getCurrentVersion();
    }

    if (!targetVersion) {
      throw new NotFoundException(`Requested version was not found for document '${documentId}'.`);
    }

    const previewableMimes = new Set([
      'application/pdf',
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/json',
    ]);
    const canPreview =
      isAuthorized &&
      !doc.isDeleted() &&
      previewableMimes.has(targetVersion.mimeType.toLowerCase());

    return {
      documentId: doc.id.value,
      versionId: targetVersion.id,
      versionNumber: targetVersion.versionNumber,
      title: doc.title,
      mimeType: targetVersion.mimeType,
      fileSize: targetVersion.fileSize,
      originalFileName: targetVersion.originalFileName,
      checksum: targetVersion.checksum,
      canPreview,
      visibilityScope: doc.visibilityScope,
      isAuthorized,
      isDeleted: doc.isDeleted(),
    };
  }

  /**
   * 11. GET /api/v1/ai/knowledge/documents/:id/ingestion
   * List ingestion jobs for all versions of a document.
   */
  @Get(':id/ingestion')
  @ApiOperation({ summary: 'Get ingestion status and history for a document' })
  @ApiParam({ name: 'id', description: 'Logical Knowledge Document ID' })
  @ApiResponse({ status: 200, type: [IngestionJobResponseDto] })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async getIngestionHistory(
    @Param('id') documentId: string,
    @CurrentUser() user: AuthenticatedUserPayload | null,
  ): Promise<IngestionJobResponseDto[]> {
    const { tenantId } = this.extractAuthContext(user);

    if (this.observabilityService) {
      return this.observabilityService.getDocumentIngestionHistory(tenantId, documentId, user);
    }

    const doc = await this.documentRepo.findById(tenantId, documentId);
    if (!doc || doc.isDeleted()) {
      throw new NotFoundException(`Knowledge document '${documentId}' was not found.`);
    }

    if (this.securityPolicy && user?.roles && user.roles.length > 0) {
      const allowedScopes = this.securityPolicy.resolveAllowedVisibilityScopes(user.roles);
      if (!allowedScopes.includes(doc.visibilityScope)) {
        throw new ForbiddenException(
          'You do not have the required role clearance to access or download this document.',
        );
      }
    }

    const versions = doc.getAllVersions();
    const allJobs: IngestionJob[] = [];

    for (const v of versions) {
      const jobs = await this.ingestionJobRepo.findByVersionId(tenantId, v.id);
      allJobs.push(...jobs);
    }

    return allJobs.map((j) => this.toIngestionJobDto(j));
  }

  /**
   * 11b. GET /api/v1/ai/knowledge/documents/:id/versions/:versionId/ingestion
   * List historical ingestion jobs for a specific document version.
   */
  @Get(':id/versions/:versionId/ingestion')
  @ApiOperation({ summary: 'Get ingestion status and history for a specific document version' })
  @ApiParam({ name: 'id', description: 'Logical Knowledge Document ID' })
  @ApiParam({ name: 'versionId', description: 'Specific document version ID' })
  @ApiResponse({ status: 200, type: [IngestionJobResponseDto] })
  @ApiResponse({ status: 404, description: 'Document or version not found' })
  async getVersionIngestionHistory(
    @Param('id') documentId: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthenticatedUserPayload | null,
  ): Promise<IngestionJobResponseDto[]> {
    const { tenantId } = this.extractAuthContext(user);

    if (this.observabilityService) {
      return this.observabilityService.getVersionIngestionHistory(
        tenantId,
        documentId,
        versionId,
        user,
      );
    }

    const doc = await this.documentRepo.findById(tenantId, documentId);
    if (!doc || doc.isDeleted()) {
      throw new NotFoundException(`Knowledge document '${documentId}' was not found.`);
    }

    const version = doc.getVersionById(versionId);
    if (!version) {
      throw new NotFoundException(
        `Document version '${versionId}' does not belong to document '${documentId}'.`,
      );
    }

    const jobs = await this.ingestionJobRepo.findByVersionId(tenantId, versionId);
    return jobs.map((j) => this.toIngestionJobDto(j));
  }

  /**
   * 11c. GET /api/v1/ai/knowledge/documents/:id/retrieval-status
   * Authoritative semantic search retrieval readiness evaluation for a document.
   */
  @Get(':id/retrieval-status')
  @ApiOperation({ summary: 'Evaluate document semantic search retrieval readiness' })
  @ApiParam({ name: 'id', description: 'Logical Knowledge Document ID' })
  @ApiResponse({ status: 200, type: IngestionRetrievalStatusDto })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async getDocumentRetrievalStatus(
    @Param('id') documentId: string,
    @CurrentUser() user: AuthenticatedUserPayload | null,
    @Query('versionId') versionId?: string,
  ): Promise<IngestionRetrievalStatusDto> {
    const { tenantId } = this.extractAuthContext(user);

    if (this.observabilityService) {
      return this.observabilityService.evaluateRetrievalReadiness(
        tenantId,
        documentId,
        versionId?.trim(),
        user,
      );
    }

    const doc = await this.documentRepo.findById(tenantId, documentId);
    if (!doc || doc.isDeleted()) {
      throw new NotFoundException(`Knowledge document '${documentId}' was not found.`);
    }

    return {
      isReadyForRetrieval: false,
      activeGenerationId: null,
      totalChunks: 0,
      indexedChunks: 0,
      embeddingsCount: 0,
      reason: 'Observability service not configured.',
    };
  }

  /**
   * 12. POST /api/v1/ai/knowledge/documents/:id/ingestion/retry
   * Retry failed ingestion for the document's current version.
   */
  @Post(':id/ingestion/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry failed ingestion for the current document version' })
  @ApiParam({ name: 'id', description: 'Logical Knowledge Document ID' })
  @ApiResponse({ status: 200, type: IngestionJobResponseDto })
  @ApiResponse({ status: 400, description: 'Job is not in a failed or retryable state' })
  @ApiResponse({ status: 404, description: 'Document or ingestion job not found' })
  async retryCurrentIngestion(
    @Param('id') documentId: string,
    @CurrentUser() user: AuthenticatedUserPayload | null,
  ): Promise<IngestionJobResponseDto> {
    const { tenantId } = this.extractAuthContext(user);

    const doc = await this.documentRepo.findById(tenantId, documentId);
    if (!doc || doc.isDeleted()) {
      throw new NotFoundException(`Knowledge document '${documentId}' was not found.`);
    }

    if (this.securityPolicy && user?.roles && user.roles.length > 0) {
      const allowedScopes = this.securityPolicy.resolveAllowedVisibilityScopes(user.roles);
      if (!allowedScopes.includes(doc.visibilityScope)) {
        throw new ForbiddenException(
          'You do not have the required role clearance to access or download this document.',
        );
      }
    }

    this.assertCanManageDocument(user, doc);

    const currentVersion = doc.getCurrentVersion();
    if (!currentVersion) {
      throw new NotFoundException('Current version not found.');
    }

    const jobs = await this.ingestionJobRepo.findByVersionId(tenantId, currentVersion.id);
    const lastJob = jobs.length > 0 ? jobs[jobs.length - 1] : null;

    if (!lastJob) {
      throw new NotFoundException(`No ingestion job exists for version '${currentVersion.id}'.`);
    }

    if (
      lastJob.lastErrorCode === IngestionErrorCode.MAX_ATTEMPTS_EXCEEDED ||
      lastJob.lastErrorCode === IngestionErrorCode.CANCELLED_BY_USER ||
      lastJob.lastErrorCode === IngestionErrorCode.SECURITY_VIOLATION ||
      lastJob.lastErrorCode === IngestionErrorCode.CHECKSUM_MISMATCH ||
      lastJob.lastErrorCode === IngestionErrorCode.UNSUPPORTED_FORMAT ||
      lastJob.lastErrorCode === IngestionErrorCode.MALFORMED_CONTENT
    ) {
      throw new BadRequestException(
        `Job cannot be retried because it is in a terminal failure state (${lastJob.lastErrorCode}).`,
      );
    }

    try {
      lastJob.retry();
      const saved = await this.ingestionJobRepo.save(lastJob);

      if (this.orchestrator) {
        setImmediate(() => {
          this.orchestrator!.processJob(saved.id, tenantId).catch(() => {});
        });
      }

      return this.toIngestionJobDto(saved);
    } catch (err: unknown) {
      this.translateDomainException(err);
    }
  }

  /**
   * 12c. POST /api/v1/ai/knowledge/documents/:id/versions/:versionId/retry
   * Retry failed ingestion for a specific document version.
   */
  @Post(':id/versions/:versionId/retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry failed ingestion for a specific document version' })
  @ApiParam({ name: 'id', description: 'Logical Knowledge Document ID' })
  @ApiParam({ name: 'versionId', description: 'Specific Document Version ID' })
  @ApiResponse({ status: 200, type: IngestionJobResponseDto })
  @ApiResponse({ status: 400, description: 'Job is not in a failed or retryable state' })
  @ApiResponse({ status: 404, description: 'Document, version, or ingestion job not found' })
  async retryVersionIngestion(
    @Param('id') documentId: string,
    @Param('versionId') versionId: string,
    @CurrentUser() user: AuthenticatedUserPayload | null,
  ): Promise<IngestionJobResponseDto> {
    const { tenantId } = this.extractAuthContext(user);

    const doc = await this.documentRepo.findById(tenantId, documentId);
    if (!doc || doc.isDeleted()) {
      throw new NotFoundException(`Knowledge document '${documentId}' was not found.`);
    }

    if (this.securityPolicy && user?.roles && user.roles.length > 0) {
      const allowedScopes = this.securityPolicy.resolveAllowedVisibilityScopes(user.roles);
      if (!allowedScopes.includes(doc.visibilityScope)) {
        throw new ForbiddenException(
          'You do not have the required role clearance to access or modify this document.',
        );
      }
    }

    this.assertCanManageDocument(user, doc);

    const version = doc.getVersionById(versionId);
    if (!version) {
      throw new NotFoundException(
        `Document version '${versionId}' does not belong to document '${documentId}'.`,
      );
    }

    const jobs = await this.ingestionJobRepo.findByVersionId(tenantId, version.id);
    const lastJob = jobs.length > 0 ? jobs[jobs.length - 1] : null;

    if (!lastJob) {
      throw new NotFoundException(`No ingestion job exists for version '${version.id}'.`);
    }

    if (
      lastJob.lastErrorCode === IngestionErrorCode.MAX_ATTEMPTS_EXCEEDED ||
      lastJob.lastErrorCode === IngestionErrorCode.CANCELLED_BY_USER ||
      lastJob.lastErrorCode === IngestionErrorCode.SECURITY_VIOLATION ||
      lastJob.lastErrorCode === IngestionErrorCode.CHECKSUM_MISMATCH ||
      lastJob.lastErrorCode === IngestionErrorCode.UNSUPPORTED_FORMAT ||
      lastJob.lastErrorCode === IngestionErrorCode.MALFORMED_CONTENT
    ) {
      throw new BadRequestException(
        `Job cannot be retried because it is in a terminal failure state (${lastJob.lastErrorCode}).`,
      );
    }

    try {
      lastJob.retry();
      const saved = await this.ingestionJobRepo.save(lastJob);

      if (this.orchestrator) {
        setImmediate(() => {
          this.orchestrator!.processJob(saved.id, tenantId).catch(() => {});
        });
      }

      return this.toIngestionJobDto(saved);
    } catch (err: unknown) {
      this.translateDomainException(err);
    }
  }

  /**
   * 12b. POST /api/v1/ai/knowledge/documents/:id/reprocess
   * Trigger full reprocessing and re-indexing of the document's current version.
   */
  @Post(':id/reprocess')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Reprocess and reindex a knowledge document',
    description:
      'Creates a new ingestion job for the current version, triggering text extraction, chunking, and embedding generation.',
  })
  @ApiParam({ name: 'id', description: 'Logical Knowledge Document ID' })
  @ApiResponse({ status: 202, type: IngestionJobResponseDto })
  @ApiResponse({ status: 400, description: 'Document is deleted or has an in-flight job' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async reprocessDocument(
    @Param('id') documentId: string,
    @CurrentUser() user: AuthenticatedUserPayload | null,
  ): Promise<IngestionJobResponseDto> {
    const { tenantId } = this.extractAuthContext(user);

    const doc = await this.documentRepo.findById(tenantId, documentId);
    if (!doc || doc.isDeleted()) {
      throw new NotFoundException(`Knowledge document '${documentId}' was not found.`);
    }

    this.assertCanManageDocument(user, doc);

    if (this.securityPolicy && user?.roles && user.roles.length > 0) {
      const allowedScopes = this.securityPolicy.resolveAllowedVisibilityScopes(user.roles);
      if (!allowedScopes.includes(doc.visibilityScope)) {
        throw new ForbiddenException(
          'You do not have the required role clearance to reprocess this document.',
        );
      }
    }

    const currentVersion = doc.getCurrentVersion();
    if (!currentVersion) {
      throw new NotFoundException('Current version not found.');
    }

    const jobs = await this.ingestionJobRepo.findByVersionId(tenantId, currentVersion.id);
    const activeJob = jobs.find((j) =>
      [
        IngestionStatus.UPLOADED,
        IngestionStatus.VALIDATING,
        IngestionStatus.PROCESSING,
        IngestionStatus.INDEXING,
      ].includes(j.status),
    );
    if (activeJob) {
      throw new BadRequestException(
        `An ingestion job is already in progress for this document (Job '${activeJob.id}', Status '${activeJob.status}').`,
      );
    }

    if (this.cleanupService) {
      await this.cleanupService.cleanupDocumentVectors(tenantId, documentId);
    }

    const newJob = IngestionJob.create({
      tenantId,
      documentId: doc.id.value,
      documentVersionId: currentVersion.id,
    });
    await this.ingestionJobRepo.save(newJob);

    if (this.orchestrator) {
      setImmediate(() => {
        this.orchestrator!.processJob(newJob.id, tenantId).catch(() => {});
      });
    }

    return this.toIngestionJobDto(newJob);
  }

  /**
   * 13. POST /api/v1/ai/knowledge/documents/:id/ingestion/cancel
   * Cancel an active ingestion job for the document's current version.
   */
  @Post(':id/ingestion/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel an active ingestion job for the current version' })
  @ApiParam({ name: 'id', description: 'Logical Knowledge Document ID' })
  @ApiResponse({ status: 200, type: IngestionJobResponseDto })
  @ApiResponse({ status: 404, description: 'No active job found to cancel' })
  @ApiResponse({ status: 409, description: 'Job is already in a terminal state' })
  async cancelCurrentIngestion(
    @Param('id') documentId: string,
    @CurrentUser() user: AuthenticatedUserPayload | null,
    @Body() dto: CancelIngestionJobRequestDto,
  ): Promise<IngestionJobResponseDto> {
    const { tenantId } = this.extractAuthContext(user);

    const doc = await this.documentRepo.findById(tenantId, documentId);
    if (!doc || doc.isDeleted()) {
      throw new NotFoundException(`Knowledge document '${documentId}' was not found.`);
    }

    if (this.securityPolicy && user?.roles && user.roles.length > 0) {
      const allowedScopes = this.securityPolicy.resolveAllowedVisibilityScopes(user.roles);
      if (!allowedScopes.includes(doc.visibilityScope)) {
        throw new ForbiddenException(
          'You do not have the required role clearance to access or download this document.',
        );
      }
    }

    this.assertCanManageDocument(user, doc);

    const currentVersion = doc.getCurrentVersion();
    if (!currentVersion) {
      throw new NotFoundException('Current version not found.');
    }

    const activeJob = await this.ingestionJobRepo.findActiveJobByVersionId(
      tenantId,
      currentVersion.id,
    );
    if (!activeJob) {
      throw new NotFoundException(
        `No active ingestion job found for version '${currentVersion.id}'.`,
      );
    }

    try {
      activeJob.cancel(dto?.reason || 'User cancelled');
      const saved = await this.ingestionJobRepo.save(activeJob);
      return this.toIngestionJobDto(saved);
    } catch (err: unknown) {
      this.translateDomainException(err);
    }
  }

  // --- Helper Mapping Methods ---

  private toDocumentDetailDto(
    doc: KnowledgeDocument,
    latestIngestionStatus?: IngestionStatus,
  ): DocumentDetailResponseDto {
    const currentVersion = doc.getCurrentVersion();
    const ext = currentVersion
      ? path.extname(currentVersion.originalFileName).replace(/^\./, '').toLowerCase()
      : undefined;

    return {
      id: doc.id.toString(),
      title: doc.title,
      description: doc.description ?? undefined,
      visibilityScope: doc.visibilityScope,
      currentVersionId: doc.currentVersionId ?? '',
      uploadedBy: doc.uploadedBy,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      deletedAt: doc.deletedAt ? doc.deletedAt.toISOString() : null,
      isDeleted: doc.isDeleted(),
      status: doc.isDeleted() ? 'DELETED' : 'ACTIVE',
      versionNumber: currentVersion?.versionNumber ?? doc.version,
      versionCount: doc.getAllVersions().length,
      originalFileName: currentVersion?.originalFileName,
      mimeType: currentVersion?.mimeType,
      fileExtension: ext,
      fileSize: currentVersion?.fileSize,
      checksum: currentVersion?.checksum,
      storageReference: currentVersion
        ? `doc-storage:${doc.id.toString()}:${currentVersion.id}`
        : undefined,
      ingestionStatus: latestIngestionStatus,
      versions: doc.getAllVersions().map((v) => this.toVersionDto(v)),
    };
  }

  private toVersionDto(
    v: DocumentVersion,
    ingestionStatus?: IngestionStatus,
  ): DocumentVersionResponseDto {
    const ext = path.extname(v.originalFileName).replace(/^\./, '').toLowerCase();
    return {
      id: v.id,
      versionNumber: v.versionNumber,
      originalFileName: v.originalFileName,
      mimeType: v.mimeType,
      fileExtension: ext,
      fileSize: v.fileSize,
      checksum: v.checksum,
      language: v.language,
      uploadedBy: v.uploadedBy,
      storageReference: `doc-storage:${v.id}`,
      ingestionStatus,
      createdAt: v.createdAt.toISOString(),
    };
  }

  private toIngestionJobDto(job: IngestionJob): IngestionJobResponseDto {
    const isTerminal =
      job.status === IngestionStatus.READY ||
      job.status === IngestionStatus.CANCELLED ||
      (job.status === IngestionStatus.FAILED && job.attemptCount >= job.maxAttempts);

    let durationMs: number | null = null;
    if (job.startedAt && job.completedAt) {
      durationMs = job.completedAt.getTime() - job.startedAt.getTime();
    } else if (job.startedAt && !job.completedAt && !job.cancelledAt) {
      durationMs = Math.max(0, Date.now() - job.startedAt.getTime());
    }

    return {
      id: job.id,
      documentId: job.documentId,
      documentVersionId: job.documentVersionId,
      status: job.status,
      attemptCount: job.attemptCount,
      maxAttempts: job.maxAttempts,
      lastErrorCode: job.lastErrorCode,
      lastErrorMessage: job.lastErrorMessage,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt ? job.startedAt.toISOString() : null,
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
      nextRetryAt: job.nextRetryAt ? job.nextRetryAt.toISOString() : null,
      cancelledAt: job.cancelledAt ? job.cancelledAt.toISOString() : null,
      cancellationReason: job.cancellationReason,
      durationMs,
      isTerminal,
      canRetry: job.canRetry(),
    };
  }

  private extractAuthContext(user: AuthenticatedUserPayload | null): {
    tenantId: string;
    userId: string;
  } {
    if (!user) {
      throw new UnauthorizedException('Authentication credentials missing or invalid.');
    }
    const tenantId = user.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Authenticated user is not assigned to a tenant.');
    }
    const userId = user.id || user.userId;
    if (!userId) {
      throw new UnauthorizedException('Authenticated user ID is missing.');
    }
    return { tenantId, userId };
  }

  private canUserManageDocument(
    user: AuthenticatedUserPayload | null,
    doc?: KnowledgeDocument,
  ): boolean {
    if (!user) return false;
    const userId = user.id || user.userId;
    return this.resourcePolicy.canManageDocument(
      {
        actorId: userId ?? '',
        tenantId: user.tenantId ?? '',
        roles: user.roles,
        permissions: user.permissions,
      },
      doc
        ? {
            id: doc.id.value,
            tenantId: doc.tenantId,
            uploadedBy: doc.uploadedBy,
            visibilityScope: doc.visibilityScope,
            deletedAt: doc.deletedAt,
          }
        : undefined,
    );
  }

  private assertCanManageDocument(
    user: AuthenticatedUserPayload | null,
    doc: KnowledgeDocument,
  ): void {
    if (!this.canUserManageDocument(user, doc)) {
      throw new ForbiddenException(
        'You do not have administrative or management permissions to modify this document.',
      );
    }
  }

  private translateDomainException(err: unknown): never {
    if (
      err instanceof DuplicateDocumentVersionException ||
      err instanceof DuplicateDocumentContentException
    ) {
      throw new ConflictException(err.message);
    }
    if (err instanceof IngestionJobCancellationConflictException) {
      throw new ConflictException(err.message);
    }
    if (
      err instanceof DocumentNotFoundException ||
      err instanceof DocumentAlreadyDeletedException
    ) {
      throw new NotFoundException(err.message);
    }
    if (err instanceof UnauthorizedDocumentAccessException) {
      throw new ForbiddenException(err.message);
    }
    if (err instanceof DocumentSizeLimitExceededException) {
      throw new HttpException(
        'File size exceeds the maximum permitted limit of 10 MB.',
        HttpStatus.PAYLOAD_TOO_LARGE,
      );
    }
    if (err instanceof DocumentSecurityRiskException) {
      throw new BadRequestException(
        'Security risk detected in document: Upload rejected due to security policy.',
      );
    }
    if (err instanceof UnsupportedDocumentFormatException) {
      throw new HttpException(
        'The document format is not supported for text extraction. Supported formats: PDF, DOCX, Markdown, Plain Text.',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }
    if (
      err instanceof DocumentValidationException ||
      err instanceof InvalidStateTransitionException ||
      err instanceof InvalidIngestionRetryException
    ) {
      throw new BadRequestException(err.message);
    }
    throw err;
  }
}
