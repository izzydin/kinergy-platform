import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import {
  IngestionJob,
  IngestionStatus,
  IngestionStageId,
  IngestionStageStatus,
  IngestionFailureCategory,
  IIngestionJobRepositoryPort,
  IKnowledgeDocumentRepositoryPort,
  IKnowledgeChunkRepositoryPort,
  IIndexGenerationRepositoryPort,
  INDEX_GENERATION_REPOSITORY_PORT,
  IVectorStorePort,
  VECTOR_STORE_PORT,
  KnowledgeDocument,
  DocumentVersion,
  IngestionJobListFilter,
  VisibilityScope,
} from '@kinergy-platform/core';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';
import {
  EnrichedIngestionJobResponseDto,
  IngestionFailureInfoDto,
  IngestionRetrievalStatusDto,
  IngestionStageInfoDto,
  PaginatedIngestionJobsResponseDto,
} from '../controllers/dtos/ingestion-observability.dto';
import { IngestionErrorCode, IngestionRetryPolicy } from './ingestion-retry.policy';
import { RetrievalSecurityPolicyService } from './retrieval/retrieval-security-policy.service';
import {
  KNOWLEDGE_DOCUMENT_REPOSITORY,
  INGESTION_JOB_REPOSITORY,
  KNOWLEDGE_CHUNK_REPOSITORY,
  RETRIEVAL_SECURITY_POLICY_SERVICE,
} from '../ai.tokens';

@Injectable()
export class IngestionObservabilityService {
  constructor(
    @Inject(INGESTION_JOB_REPOSITORY)
    private readonly ingestionJobRepo: IIngestionJobRepositoryPort,
    @Inject(KNOWLEDGE_DOCUMENT_REPOSITORY)
    private readonly documentRepo: IKnowledgeDocumentRepositoryPort,
    @Inject(KNOWLEDGE_CHUNK_REPOSITORY)
    private readonly chunkRepo: IKnowledgeChunkRepositoryPort,
    @Inject(INDEX_GENERATION_REPOSITORY_PORT)
    private readonly generationRepo: IIndexGenerationRepositoryPort,
    @Inject(VECTOR_STORE_PORT)
    private readonly vectorStore: IVectorStorePort,
    @Optional()
    @Inject(RETRIEVAL_SECURITY_POLICY_SERVICE)
    private readonly securityPolicy?: RetrievalSecurityPolicyService,
  ) {}

  /**
   * Retrieves enriched ingestion history for all versions of a specific document.
   */
  public async getDocumentIngestionHistory(
    tenantId: string,
    documentId: string,
    user: AuthenticatedUserPayload | null,
  ): Promise<EnrichedIngestionJobResponseDto[]> {
    const doc = await this.documentRepo.findById(tenantId, documentId);
    if (!doc || doc.isDeleted()) {
      throw new NotFoundException(`Knowledge document '${documentId}' was not found.`);
    }

    this.assertDocumentClearance(user, doc);

    const jobs = await this.ingestionJobRepo.findByDocumentId(tenantId, documentId);

    // If no jobs returned via findByDocumentId (fallback for versions)
    if (jobs.length === 0) {
      const versions = doc.getAllVersions();
      for (const v of versions) {
        const vJobs = await this.ingestionJobRepo.findByVersionId(tenantId, v.id);
        jobs.push(...vJobs);
      }
    }

    // Sort descending by createdAt
    jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return Promise.all(jobs.map((job) => this.enrichJobDto(tenantId, job, doc)));
  }

  /**
   * Retrieves enriched ingestion jobs for a specific document version.
   */
  public async getVersionIngestionHistory(
    tenantId: string,
    documentId: string,
    versionId: string,
    user: AuthenticatedUserPayload | null,
  ): Promise<EnrichedIngestionJobResponseDto[]> {
    const doc = await this.documentRepo.findById(tenantId, documentId);
    if (!doc || doc.isDeleted()) {
      throw new NotFoundException(`Knowledge document '${documentId}' was not found.`);
    }

    this.assertDocumentClearance(user, doc);

    const version = doc.getVersionById(versionId);
    if (!version) {
      throw new NotFoundException(
        `Document version '${versionId}' does not belong to document '${documentId}'.`,
      );
    }

    const jobs = await this.ingestionJobRepo.findByVersionId(tenantId, versionId);
    jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return Promise.all(jobs.map((job) => this.enrichJobDto(tenantId, job, doc)));
  }

  /**
   * Lists cross-document ingestion jobs within the tenant boundary for administrative monitoring.
   */
  public async listTenantIngestionJobs(
    tenantId: string,
    filter: IngestionJobListFilter,
    user: AuthenticatedUserPayload | null,
  ): Promise<PaginatedIngestionJobsResponseDto> {
    this.assertCanManageIngestion(user);

    const page = Math.max(
      1,
      filter.offset !== undefined ? Math.floor(filter.offset / (filter.limit || 20)) + 1 : 1,
    );
    const limit = Math.max(1, Math.min(100, filter.limit || 20));
    const offset = (page - 1) * limit;

    const queryFilter: IngestionJobListFilter = {
      ...filter,
      limit,
      offset,
    };

    const { items: jobs, total } = await this.ingestionJobRepo.findAll(tenantId, queryFilter);
    const totalPages = Math.ceil(total / limit) || 1;

    const enrichedItems = await Promise.all(jobs.map((job) => this.enrichJobDto(tenantId, job)));

    return {
      items: enrichedItems,
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  /**
   * Evaluates authoritative retrieval readiness for a document version.
   */
  public async evaluateRetrievalReadiness(
    tenantId: string,
    documentId: string,
    versionId?: string,
    user?: AuthenticatedUserPayload | null,
  ): Promise<IngestionRetrievalStatusDto> {
    const doc = await this.documentRepo.findById(tenantId, documentId);
    if (!doc) {
      return {
        isReadyForRetrieval: false,
        activeGenerationId: null,
        totalChunks: 0,
        indexedChunks: 0,
        embeddingsCount: 0,
        reason: `Document '${documentId}' does not exist.`,
      };
    }

    if (user) {
      this.assertDocumentClearance(user, doc);
    }

    if (doc.isDeleted()) {
      return {
        isReadyForRetrieval: false,
        activeGenerationId: null,
        totalChunks: 0,
        indexedChunks: 0,
        embeddingsCount: 0,
        reason: 'Document has been soft-deleted and is excluded from semantic search.',
      };
    }

    const targetVersionId = versionId || doc.currentVersionId;
    if (!targetVersionId) {
      return {
        isReadyForRetrieval: false,
        activeGenerationId: null,
        totalChunks: 0,
        indexedChunks: 0,
        embeddingsCount: 0,
        reason: 'Document has no active version.',
      };
    }

    const currentVer = doc.getCurrentVersion();
    const currentVersionId = currentVer ? currentVer.id : doc.currentVersionId || null;
    const currentVersionNumber = currentVer ? currentVer.versionNumber : null;
    const targetVer = doc.getVersionById(targetVersionId);
    const targetVersionNumber = targetVer ? targetVer.versionNumber : null;

    const [activeGen, totalChunks, jobs, allDocJobs] = await Promise.all([
      this.generationRepo.findActiveByTenantId(tenantId),
      this.chunkRepo.countByVersionId(tenantId, targetVersionId),
      this.ingestionJobRepo.findByVersionId(tenantId, targetVersionId),
      this.ingestionJobRepo.findByDocumentId(tenantId, doc.id.value),
    ]);

    const latestJob = jobs.length > 0 ? jobs[0] : null;
    const lastReadyJob = allDocJobs.find((j) => j.status === IngestionStatus.READY);
    const lastSuccessfulIndexingAt = lastReadyJob?.completedAt?.toISOString() || null;

    let embeddingsCount = 0;
    const activeGenIdStr = activeGen?.id ? activeGen.id.value : null;

    if (activeGen && activeGenIdStr) {
      const embeddings = await this.vectorStore.findByDocumentVersionId(
        targetVersionId,
        activeGenIdStr,
      );
      embeddingsCount = embeddings.length;
    }

    // Determine which version (if any) is currently represented in the active index generation
    let indexedVersionId: string | null = null;
    let indexedVersionNumber: number | null = null;

    if (activeGen && activeGenIdStr) {
      const allVersions = [...doc.getAllVersions()].sort(
        (a: DocumentVersion, b: DocumentVersion) => b.versionNumber - a.versionNumber,
      );
      for (const v of allVersions) {
        if (v.id === targetVersionId) {
          if (embeddingsCount > 0 && latestJob?.status === IngestionStatus.READY) {
            indexedVersionId = v.id;
            indexedVersionNumber = v.versionNumber;
            break;
          }
        } else {
          const vEmbeddings = await this.vectorStore.findByDocumentVersionId(v.id, activeGenIdStr);
          if (vEmbeddings.length > 0) {
            indexedVersionId = v.id;
            indexedVersionNumber = v.versionNumber;
            break;
          }
        }
      }
    }

    // Identify discrepancies between current document version and indexed version
    let hasVersionDiscrepancy = false;
    let discrepancyReason: string | null = null;

    if (currentVersionId && indexedVersionId && currentVersionId !== indexedVersionId) {
      hasVersionDiscrepancy = true;
      const currentVerJobs = await this.ingestionJobRepo.findByVersionId(
        tenantId,
        currentVersionId,
      );
      const currentVerLatestJob = currentVerJobs.length > 0 ? currentVerJobs[0] : null;

      if (
        currentVerLatestJob &&
        (currentVerLatestJob.status === IngestionStatus.PROCESSING ||
          currentVerLatestJob.status === IngestionStatus.INDEXING ||
          currentVerLatestJob.status === IngestionStatus.VALIDATING)
      ) {
        discrepancyReason = `La versión actual (v${currentVersionNumber}) está siendo procesada. La versión anterior (v${indexedVersionNumber}) permanece activa en el índice RAG.`;
      } else if (currentVerLatestJob && currentVerLatestJob.status === IngestionStatus.FAILED) {
        discrepancyReason = `La indexación de la versión actual (v${currentVersionNumber}) falló. La versión anterior (v${indexedVersionNumber}) continúa activa en el índice RAG.`;
      } else if (currentVerLatestJob && currentVerLatestJob.status === IngestionStatus.UPLOADED) {
        discrepancyReason = `La versión actual (v${currentVersionNumber}) está en cola. La versión anterior (v${indexedVersionNumber}) continúa activa en el índice RAG.`;
      } else {
        discrepancyReason = `La versión actual (v${currentVersionNumber}) no está indexada. La versión anterior (v${indexedVersionNumber}) continúa activa en el índice RAG.`;
      }
    } else if (currentVersionId && !indexedVersionId) {
      hasVersionDiscrepancy = true;
      discrepancyReason = `Ninguna versión de este documento está actualmente indexada en la generación activa de RAG.`;
    }

    const versionMeta = {
      targetVersionId,
      targetVersionNumber,
      currentVersionId,
      currentVersionNumber,
      indexedVersionId,
      indexedVersionNumber,
      hasVersionDiscrepancy,
      discrepancyReason,
      lastSuccessfulIndexingAt,
    };

    if (!activeGen || !activeGenIdStr) {
      return {
        isReadyForRetrieval: false,
        activeGenerationId: null,
        totalChunks,
        indexedChunks: 0,
        embeddingsCount: 0,
        reason: 'No ACTIVE index generation exists for this tenant.',
        ...versionMeta,
      };
    }

    if (!latestJob) {
      return {
        isReadyForRetrieval: false,
        activeGenerationId: activeGenIdStr,
        totalChunks,
        indexedChunks: embeddingsCount,
        embeddingsCount,
        reason: `No ingestion job exists for version '${targetVersionId}'.`,
        ...versionMeta,
      };
    }

    if (latestJob.status !== IngestionStatus.READY) {
      return {
        isReadyForRetrieval: false,
        activeGenerationId: activeGenIdStr,
        totalChunks,
        indexedChunks: embeddingsCount,
        embeddingsCount,
        reason: `Latest ingestion job is in '${latestJob.status}' state (not READY).`,
        ...versionMeta,
      };
    }

    if (totalChunks === 0) {
      return {
        isReadyForRetrieval: false,
        activeGenerationId: activeGenIdStr,
        totalChunks: 0,
        indexedChunks: 0,
        embeddingsCount: 0,
        reason: 'Document version contains 0 parsed chunks.',
        ...versionMeta,
      };
    }

    if (embeddingsCount === 0) {
      return {
        isReadyForRetrieval: false,
        activeGenerationId: activeGenIdStr,
        totalChunks,
        indexedChunks: 0,
        embeddingsCount: 0,
        reason: 'No vector embeddings found in active generation for this version.',
        ...versionMeta,
      };
    }

    return {
      isReadyForRetrieval: true,
      activeGenerationId: activeGenIdStr,
      totalChunks,
      indexedChunks: embeddingsCount,
      embeddingsCount,
      reason: `Document version is fully indexed and available for semantic retrieval in generation '${activeGenIdStr}'.`,
      ...versionMeta,
    };
  }

  /**
   * Enriches an IngestionJob aggregate into an EnrichedIngestionJobResponseDto.
   */
  public async enrichJobDto(
    tenantId: string,
    job: IngestionJob,
    doc?: KnowledgeDocument,
  ): Promise<EnrichedIngestionJobResponseDto> {
    const [totalChunks, activeGen] = await Promise.all([
      this.chunkRepo.countByVersionId(tenantId, job.documentVersionId).catch(() => 0),
      this.generationRepo.findActiveByTenantId(tenantId).catch(() => null),
    ]);

    let embeddingsCount = 0;
    const activeGenIdStr = activeGen?.id ? activeGen.id.value : null;

    if (activeGen && activeGenIdStr) {
      const embeddings = await this.vectorStore
        .findByDocumentVersionId(job.documentVersionId, activeGenIdStr)
        .catch(() => []);
      embeddingsCount = embeddings.length;
    }

    const failureInfo = this.classifyAndSanitizeFailure(
      job.lastErrorCode,
      job.lastErrorMessage,
      job.attemptCount,
      job.status,
      job.completedAt,
    );

    const stages = this.buildStages(job, failureInfo, totalChunks, embeddingsCount, activeGenIdStr);

    let durationMs: number | null = null;
    if (job.startedAt && job.completedAt) {
      durationMs = job.completedAt.getTime() - job.startedAt.getTime();
    } else if (job.startedAt && !job.completedAt && !job.cancelledAt) {
      durationMs = Math.max(0, Date.now() - job.startedAt.getTime());
    }

    const isTerminal =
      job.status === IngestionStatus.READY ||
      job.status === IngestionStatus.CANCELLED ||
      (job.status === IngestionStatus.FAILED && job.attemptCount >= job.maxAttempts);

    const canRetry = job.status === IngestionStatus.FAILED && job.attemptCount < job.maxAttempts;

    const retrievalStatus: IngestionRetrievalStatusDto = {
      isReadyForRetrieval:
        job.status === IngestionStatus.READY &&
        (!doc || !doc.isDeleted()) &&
        activeGen !== null &&
        totalChunks > 0 &&
        embeddingsCount > 0,
      activeGenerationId: activeGenIdStr,
      totalChunks,
      indexedChunks: embeddingsCount,
      embeddingsCount,
      reason:
        job.status === IngestionStatus.READY &&
        (!doc || !doc.isDeleted()) &&
        activeGenIdStr &&
        totalChunks > 0 &&
        embeddingsCount > 0
          ? `Indexed and ready for retrieval in generation '${activeGenIdStr}'.`
          : job.status !== IngestionStatus.READY
            ? `Ingestion status is '${job.status}'.`
            : totalChunks === 0
              ? 'No textual chunks created.'
              : embeddingsCount === 0
                ? 'No embeddings committed to active index generation.'
                : 'Retrieval conditions unfulfilled.',
    };

    return {
      id: job.id,
      documentId: job.documentId,
      documentVersionId: job.documentVersionId,
      status: job.status,
      currentStage: this.resolveCurrentStage(job, failureInfo),
      attemptCount: job.attemptCount,
      maxAttempts: job.maxAttempts,
      createdAt: job.createdAt.toISOString(),
      startedAt: job.startedAt ? job.startedAt.toISOString() : null,
      completedAt: job.completedAt ? job.completedAt.toISOString() : null,
      nextRetryAt: job.nextRetryAt ? job.nextRetryAt.toISOString() : null,
      cancelledAt: job.cancelledAt ? job.cancelledAt.toISOString() : null,
      cancellationReason: job.cancellationReason,
      durationMs,
      isTerminal,
      canRetry,
      lastErrorCode: job.lastErrorCode,
      lastErrorMessage: failureInfo?.message ?? job.lastErrorMessage,
      failureInfo,
      stages,
      retrievalStatus,
    };
  }

  // --- Private Helper Methods ---

  private resolveCurrentStage(
    job: IngestionJob,
    failureInfo: IngestionFailureInfoDto | null,
  ): string {
    switch (job.status) {
      case IngestionStatus.UPLOADED:
        return 'UPLOADED';
      case IngestionStatus.VALIDATING:
        return IngestionStageId.VALIDATING;
      case IngestionStatus.PROCESSING:
        return IngestionStageId.PROCESSING;
      case IngestionStatus.INDEXING:
        return IngestionStageId.INDEXING;
      case IngestionStatus.READY:
        return 'READY';
      case IngestionStatus.FAILED:
        return failureInfo?.failedStage ?? 'FAILED';
      case IngestionStatus.CANCELLED:
        return 'CANCELLED';
      default:
        return job.status;
    }
  }

  private buildStages(
    job: IngestionJob,
    failureInfo: IngestionFailureInfoDto | null,
    totalChunks: number,
    indexedChunks: number,
    activeGenId: string | null,
  ): IngestionStageInfoDto[] {
    const stage1: IngestionStageInfoDto = {
      stage: IngestionStageId.VALIDATING,
      label: 'Validación de Formato y Estructura',
      status: IngestionStageStatus.PENDING,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      failureInfo: null,
      metrics: null,
    };

    const stage2: IngestionStageInfoDto = {
      stage: IngestionStageId.PROCESSING,
      label: 'Extracción de Texto y Fragmentación',
      status: IngestionStageStatus.PENDING,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      failureInfo: null,
      metrics: {
        totalChunks,
      },
    };

    const stage3: IngestionStageInfoDto = {
      stage: IngestionStageId.INDEXING,
      label: 'Generación de Vectores e Indexación Semántica',
      status: IngestionStageStatus.PENDING,
      startedAt: null,
      completedAt: null,
      durationMs: null,
      failureInfo: null,
      metrics: {
        indexedChunks,
        indexGenerationId: activeGenId,
      },
    };

    const startedIso = job.startedAt ? job.startedAt.toISOString() : null;
    const completedIso = job.completedAt ? job.completedAt.toISOString() : null;

    switch (job.status) {
      case IngestionStatus.UPLOADED:
        // All stay PENDING
        break;

      case IngestionStatus.VALIDATING:
        stage1.status = IngestionStageStatus.IN_PROGRESS;
        stage1.startedAt = startedIso;
        break;

      case IngestionStatus.PROCESSING:
        stage1.status = IngestionStageStatus.COMPLETED;
        stage1.startedAt = startedIso;
        stage2.status = IngestionStageStatus.IN_PROGRESS;
        break;

      case IngestionStatus.INDEXING:
        stage1.status = IngestionStageStatus.COMPLETED;
        stage1.startedAt = startedIso;
        stage2.status = IngestionStageStatus.COMPLETED;
        stage3.status = IngestionStageStatus.IN_PROGRESS;
        break;

      case IngestionStatus.READY:
        stage1.status = IngestionStageStatus.COMPLETED;
        stage1.startedAt = startedIso;
        stage2.status = IngestionStageStatus.COMPLETED;
        stage3.status = IngestionStageStatus.COMPLETED;
        stage3.completedAt = completedIso;
        if (job.startedAt && job.completedAt) {
          stage3.durationMs = job.completedAt.getTime() - job.startedAt.getTime();
        }
        break;

      case IngestionStatus.FAILED: {
        const failedStage = failureInfo?.failedStage || IngestionStageId.PROCESSING;
        if (failedStage === IngestionStageId.VALIDATING) {
          stage1.status = IngestionStageStatus.FAILED;
          stage1.startedAt = startedIso;
          stage1.failureInfo = failureInfo;
          stage2.status = IngestionStageStatus.SKIPPED;
          stage3.status = IngestionStageStatus.SKIPPED;
        } else if (failedStage === IngestionStageId.PROCESSING) {
          stage1.status = IngestionStageStatus.COMPLETED;
          stage1.startedAt = startedIso;
          stage2.status = IngestionStageStatus.FAILED;
          stage2.failureInfo = failureInfo;
          stage3.status = IngestionStageStatus.SKIPPED;
        } else {
          stage1.status = IngestionStageStatus.COMPLETED;
          stage1.startedAt = startedIso;
          stage2.status = IngestionStageStatus.COMPLETED;
          stage3.status = IngestionStageStatus.FAILED;
          stage3.failureInfo = failureInfo;
        }
        break;
      }

      case IngestionStatus.CANCELLED:
        stage1.status = IngestionStageStatus.CANCELLED;
        stage2.status = IngestionStageStatus.SKIPPED;
        stage3.status = IngestionStageStatus.SKIPPED;
        break;
    }

    return [stage1, stage2, stage3];
  }

  private classifyAndSanitizeFailure(
    errorCode: string | null,
    errorMessage: string | null,
    attemptNumber: number,
    status: IngestionStatus,
    completedAt?: Date | null,
  ): IngestionFailureInfoDto | null {
    if (status !== IngestionStatus.FAILED && !errorCode && !errorMessage) {
      return null;
    }

    const code = errorCode || IngestionErrorCode.UNKNOWN_NON_RETRYABLE;
    const isRetryable = IngestionRetryPolicy.isRetryable(code);

    let category = IngestionFailureCategory.UNKNOWN;
    let failedStage = IngestionStageId.PROCESSING;

    const lowerCode = code.toLowerCase();
    const rawMsg = errorMessage || 'An unexpected error occurred during ingestion.';

    if (
      lowerCode.includes('format') ||
      lowerCode.includes('corrupt') ||
      lowerCode.includes('malformed') ||
      lowerCode.includes('empty') ||
      lowerCode.includes('size') ||
      lowerCode.includes('security')
    ) {
      category = IngestionFailureCategory.VALIDATION;
      failedStage = IngestionStageId.VALIDATING;
    } else if (lowerCode.includes('parse') || lowerCode.includes('extract')) {
      category = IngestionFailureCategory.PARSING;
      failedStage = IngestionStageId.PROCESSING;
    } else if (lowerCode.includes('chunk')) {
      category = IngestionFailureCategory.CHUNKING;
      failedStage = IngestionStageId.PROCESSING;
    } else if (lowerCode.includes('storage')) {
      category = IngestionFailureCategory.STORAGE;
      failedStage = IngestionStageId.PROCESSING;
    } else if (
      lowerCode.includes('index') ||
      lowerCode.includes('embedding') ||
      lowerCode.includes('vector')
    ) {
      category = IngestionFailureCategory.INDEXING;
      failedStage = IngestionStageId.INDEXING;
    } else if (lowerCode.includes('timeout')) {
      category = IngestionFailureCategory.TIMEOUT;
      failedStage = IngestionStageId.PROCESSING;
    } else if (lowerCode.includes('cancel')) {
      category = IngestionFailureCategory.CANCELLATION;
      failedStage = IngestionStageId.PROCESSING;
    } else if (
      lowerCode.includes('database') ||
      lowerCode.includes('crash') ||
      lowerCode.includes('network')
    ) {
      category = IngestionFailureCategory.INFRASTRUCTURE;
      failedStage = IngestionStageId.PROCESSING;
    }

    const sanitizedMessage = this.sanitizeErrorMessage(rawMsg, code);

    return {
      code,
      category,
      message: sanitizedMessage,
      failedStage,
      isRetryable,
      failedAt: completedAt ? completedAt.toISOString() : new Date().toISOString(),
      attemptNumber,
    };
  }

  /**
   * Sanitizes diagnostic messages to ensure no stack traces, database strings, or secrets leak.
   */
  public sanitizeErrorMessage(rawMessage: string, code: string): string {
    // First, redact multiline private key blocks on rawMessage before splitting lines
    let clean = rawMessage.replace(
      /-----BEGIN[A-Z\s]+PRIVATE KEY-----[\s\S]*?-----END[A-Z\s]+PRIVATE KEY-----/gi,
      '[redacted_private_key]',
    );
    clean = clean.replace(/-----BEGIN[A-Z\s]+PRIVATE KEY-----/gi, '[redacted_private_key]');

    // Strip common stack trace signatures and multiline dumps
    clean = clean.split('\n')[0] || clean;
    clean = clean.replace(/at\s+[\w\d_$.<>]+\s+\(.*?\)/g, '');

    // Redact full database URIs, web URLs, and credentials first
    clean = clean.replace(/[a-zA-Z0-9+.-]+:\/\/[^\s]+/gi, '[redacted_uri]');
    clean = clean.replace(/[a-zA-Z0-9_.-]+:[^\s@]+@[^\s/]+/gi, '[redacted_credentials]');
    clean = clean.replace(/bearer\s+[\w\-._~+/]+=*/gi, '[redacted_token]');
    clean = clean.replace(
      /eyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
      '[redacted_jwt]',
    );

    // Redact passwords, tokens, and secret fields in query strings or JSON
    clean = clean.replace(/password\s*=\s*[^\s;]+/gi, 'password=[redacted]');
    clean = clean.replace(
      /["']?(?:apiKey|api_key|client_secret|clientSecret|secret_key|secretKey|private_key|privateKey|access_token|accessToken|token)["']?\s*[:=]\s*["']?[a-zA-Z0-9_\-.~+/=]{8,}["']?/gi,
      '[redacted_secret]',
    );

    // Redact vendor API keys (OpenAI, Google, Anthropic, AWS)
    clean = clean.replace(/sk-[a-zA-Z0-9_-]{20,}/gi, '[redacted_api_key]');
    clean = clean.replace(/AIza[0-9A-Za-z-_]{30,}/gi, '[redacted_api_key]');
    clean = clean.replace(/sk-ant-[a-zA-Z0-9_-]{20,}/gi, '[redacted_api_key]');
    clean = clean.replace(/AKIA[0-9A-Z]{16}/g, '[redacted_aws_key]');

    // Redact internal IPv4 addresses and internal hosts
    clean = clean.replace(
      /\b(?:10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|127\.0\.0\.1)(?::\d+)?\b/g,
      '[redacted_host]',
    );

    // Redact raw document content dumps
    clean = clean.replace(
      /(?:chunk content|extracted text|document content)\s*:\s*["'][^"']{40,}["']/gi,
      '[redacted_content]',
    );
    clean = clean.replace(/["'][^"']{80,}["']/g, '[redacted_content]');

    // Redact filesystem paths (Windows C:\... or Unix /...)
    clean = clean.replace(/([a-zA-Z]:\\|\/)[^\s:;,]+/g, '[redacted_path]');
    clean = clean.trim();

    // Cap length to avoid massive diagnostic payloads in admin UI
    if (clean.length > 300) {
      clean = `${clean.substring(0, 297)}...`;
    }

    if (!clean || clean.length < 5) {
      switch (code) {
        case IngestionErrorCode.UNSUPPORTED_FORMAT:
          return 'The document format is not supported for text extraction.';
        case IngestionErrorCode.MALFORMED_CONTENT:
          return 'The document content is corrupt or cannot be parsed.';
        case IngestionErrorCode.STORAGE_TIMEOUT:
          return 'Connection to storage service timed out during processing.';
        case IngestionErrorCode.STORAGE_UNAVAILABLE:
          return 'Storage service temporarily unavailable.';
        case IngestionErrorCode.PROCESSING_TIMEOUT:
          return 'Document extraction exceeded processing time limit.';
        case IngestionErrorCode.WORKER_CRASH_RECOVERED:
          return 'Processing worker terminated unexpectedly and was recovered.';
        case IngestionErrorCode.CANCELLED_BY_USER:
          return 'Ingestion job was cancelled by operator request.';
        default:
          return 'Processing encountered an unexpected error.';
      }
    }

    return clean;
  }

  private assertDocumentClearance(
    user: AuthenticatedUserPayload | null,
    doc: KnowledgeDocument,
  ): void {
    if (doc.visibilityScope === VisibilityScope.ALL_STAFF) {
      return;
    }
    const roles = user?.roles ?? [];
    if (!roles || roles.length === 0) {
      throw new ForbiddenException(
        'You do not have the required role clearance to access ingestion diagnostics for this document.',
      );
    }
    if (this.securityPolicy) {
      const allowedScopes = this.securityPolicy.resolveAllowedVisibilityScopes(roles);
      if (!allowedScopes.includes(doc.visibilityScope)) {
        throw new ForbiddenException(
          'You do not have the required role clearance to access ingestion diagnostics for this document.',
        );
      }
    }
  }

  private assertCanManageIngestion(user: AuthenticatedUserPayload | null): void {
    if (!user) {
      throw new ForbiddenException('Authentication required for ingestion monitoring.');
    }
    const roles = (user.roles ?? []).map((r) => r.toLowerCase());
    const isPrivileged = roles.some((r) =>
      ['owner', 'superadmin', 'admin', 'administrator', 'manager', 'management', 'gestor'].includes(
        r,
      ),
    );
    if (!isPrivileged) {
      throw new ForbiddenException(
        'Administrative or management clearance required to access cross-document ingestion monitoring.',
      );
    }
  }
}
