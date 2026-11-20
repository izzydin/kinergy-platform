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
  HttpCode,
  HttpStatus,
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
  DuplicateDocumentVersionException,
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
} from '@kinergy-platform/core';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
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
} from '../ai.tokens';
import { VectorCleanupService } from '../services/indexing/vector-cleanup.service';
import { SecureDocumentUploadService } from '../services/secure-document-upload.service';
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
} from './dtos/ai-document.dto';

interface MulterUploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags('AI - Knowledge Documents')
@ApiBearerAuth()
@Controller(['api/v1/ai/knowledge/documents', 'api/v1/ai/documents'])
@UseGuards(AuthenticationGuard, AuthorizationGuard)
export class AiDocumentController {
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
  ) {}

  /**
   * 1. POST /api/v1/ai/knowledge/documents
   * Upload a new knowledge document with its initial version.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
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

    const filter = {
      includeDeleted: false,
      search: query.search?.trim(),
      visibilityScope: query.visibilityScope,
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

    const items = docs.map((doc) => this.toDocumentDetailDto(doc));

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
  ): Promise<DocumentDetailResponseDto> {
    const { tenantId } = this.extractAuthContext(user);

    const doc = await this.documentRepo.findById(tenantId, documentId);
    if (!doc || doc.isDeleted()) {
      throw new NotFoundException(`Knowledge document '${documentId}' was not found.`);
    }

    return this.toDocumentDetailDto(doc);
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

    try {
      if (dto.title !== undefined || dto.description !== undefined) {
        doc.updateMetadata(dto.title ?? doc.title, dto.description);
      }

      if (dto.visibilityScope !== undefined) {
        doc.changeVisibilityScope(dto.visibilityScope);
      }

      const updated = await this.documentRepo.save(doc);
      return this.toDocumentDetailDto(updated);
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
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
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

    const doc = await this.documentRepo.findById(tenantId, documentId);
    if (!doc || doc.isDeleted()) {
      throw new NotFoundException(`Knowledge document '${documentId}' was not found.`);
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

    const currentVersion = doc.getCurrentVersion();
    if (!currentVersion) {
      throw new NotFoundException('Current version not found.');
    }

    const jobs = await this.ingestionJobRepo.findByVersionId(tenantId, currentVersion.id);
    const lastJob = jobs.length > 0 ? jobs[jobs.length - 1] : null;

    if (!lastJob) {
      throw new NotFoundException(`No ingestion job exists for version '${currentVersion.id}'.`);
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

  private toDocumentDetailDto(doc: KnowledgeDocument): DocumentDetailResponseDto {
    return {
      id: doc.id.toString(),
      title: doc.title,
      description: doc.description ?? undefined,
      visibilityScope: doc.visibilityScope,
      currentVersionId: doc.currentVersionId ?? '',
      uploadedBy: doc.uploadedBy,
      createdAt: doc.createdAt.toISOString(),
      updatedAt: doc.updatedAt.toISOString(),
      versions: doc.getAllVersions().map((v) => this.toVersionDto(v)),
    };
  }

  private toVersionDto(v: DocumentVersion): DocumentVersionResponseDto {
    return {
      id: v.id,
      versionNumber: v.versionNumber,
      originalFileName: v.originalFileName,
      mimeType: v.mimeType,
      fileSize: v.fileSize,
      checksum: v.checksum,
      language: v.language,
      uploadedBy: v.uploadedBy,
      createdAt: v.createdAt.toISOString(),
    };
  }

  private toIngestionJobDto(job: IngestionJob): IngestionJobResponseDto {
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
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
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

  private translateDomainException(err: unknown): never {
    if (err instanceof DuplicateDocumentVersionException) {
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
