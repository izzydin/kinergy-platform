import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  IDocumentIndexingPort,
  DocumentIndexingRequest,
  DocumentIndexingResult,
  IIndexGenerationRepositoryPort,
  INDEX_GENERATION_REPOSITORY_PORT,
  IVectorStorePort,
  VECTOR_STORE_PORT,
  IVectorIndexingJobRepositoryPort,
  VECTOR_INDEXING_JOB_REPOSITORY_PORT,
  IKnowledgeChunkRepositoryPort,
  IndexGeneration,
  IndexGenerationStatus,
  VectorIndexingJob,
  VectorIndexingScope,
  VectorIndexingJobStatus,
  EmbeddingProfile,
  GenerationCancelledException,
  IndexGenerationIneligibleException,
  IndexGenerationNotFoundException,
  VectorIndexingErrorCode,
} from '@kinergy-platform/core';
import {
  KNOWLEDGE_CHUNK_REPOSITORY,
  EMBEDDING_GENERATION_PIPELINE_SERVICE,
  AI_CONFIG_TOKEN,
} from '../../ai.tokens';
import { EmbeddingGenerationPipelineService } from '../embedding-generation-pipeline.service';
import { AiConfiguration } from '../../config/ai.config';
import { PrismaService } from '../../../platform/persistence/prisma/prisma.service';

export interface IndexDocumentVersionOptions {
  readonly tenantId: string;
  readonly documentId: string;
  readonly versionId: string;
  readonly generationId?: string;
  readonly signal?: AbortSignal;
  readonly isCancelled?: () => Promise<boolean>;
}

/**
 * Orchestrator service providing durable, idempotent, recoverable vector indexing
 * across document, version, and generation scopes.
 *
 * Implements IDocumentIndexingPort for seamless integration with IngestionOrchestratorService.
 */
@Injectable()
export class VectorIndexingOrchestratorService implements IDocumentIndexingPort {
  private readonly logger = new Logger(VectorIndexingOrchestratorService.name);

  constructor(
    @Inject(INDEX_GENERATION_REPOSITORY_PORT)
    private readonly generationRepo: IIndexGenerationRepositoryPort,
    @Inject(VECTOR_STORE_PORT)
    private readonly vectorStore: IVectorStorePort,
    @Inject(VECTOR_INDEXING_JOB_REPOSITORY_PORT)
    private readonly jobRepo: IVectorIndexingJobRepositoryPort,
    @Inject(KNOWLEDGE_CHUNK_REPOSITORY)
    private readonly chunkRepo: IKnowledgeChunkRepositoryPort,
    @Inject(EMBEDDING_GENERATION_PIPELINE_SERVICE)
    private readonly pipelineService: EmbeddingGenerationPipelineService,
    @Inject(AI_CONFIG_TOKEN)
    private readonly config: AiConfiguration,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Primary entry point fulfilling IDocumentIndexingPort from document ingestion pipeline.
   */
  public async indexDocument(request: DocumentIndexingRequest): Promise<DocumentIndexingResult> {
    return this.indexDocumentVersion({
      tenantId: request.tenantId,
      documentId: request.documentId,
      versionId: request.versionId,
    });
  }

  /**
   * Orchestrates the complete indexing lifecycle for a specific document version.
   */
  public async indexDocumentVersion(
    options: IndexDocumentVersionOptions,
  ): Promise<DocumentIndexingResult> {
    const { tenantId, documentId, versionId } = options;

    // 1. Cooperative cancellation check
    await this.checkCancellation(options);

    // 2. Resolve or create eligible IndexGeneration
    const generation = await this.resolveOrProvisionGeneration(tenantId, options.generationId);

    // 3. Prevent duplicate concurrent indexing and claim job
    const job = await this.acquireOrClaimJob(
      tenantId,
      versionId,
      generation.id.value,
      generation.profile.profileId,
    );
    if (!job) {
      this.logger.warn(
        `Job for version '${versionId}' in generation '${generation.id.value}' could not be claimed (already running or claimed). Skipping duplicate execution.`,
      );
      return {
        indexed: true,
        chunkCount: 0,
        embeddingModel: generation.profile.modelName,
        notes: 'Job already claimed or in progress by another worker.',
      };
    }

    try {
      // 4. Select eligible chunks from knowledge chunk store
      const allChunks = await this.chunkRepo.findByVersionId(tenantId, versionId);
      if (allChunks.length === 0) {
        this.logger.warn(
          `No chunks found for version '${versionId}'. Marking job completed with 0 chunks.`,
        );
        job.setTotalChunks(0);
        job.complete();
        await this.jobRepo.save(job);
        return {
          indexed: true,
          chunkCount: 0,
          embeddingModel: generation.profile.modelName,
          notes: 'No chunks available for indexing.',
        };
      }

      job.setTotalChunks(allChunks.length);
      await this.jobRepo.save(job);

      // 5. Idempotency Filter: check already-persisted embeddings with identical fingerprint
      const existingEmbeddings = await this.vectorStore.findByDocumentVersionId(
        versionId,
        generation.id.value,
      );
      const existingMap = new Map(
        existingEmbeddings.map((e) => [e.chunkId.value, e.contentFingerprint]),
      );

      const unindexedChunks = allChunks.filter((chunk) => {
        const expectedFp = this.pipelineService.calculateProcessingFingerprint(
          chunk,
          generation.profile,
        );
        return existingMap.get(chunk.id.value) !== expectedFp;
      });

      if (unindexedChunks.length === 0) {
        this.logger.log(
          `All ${allChunks.length} chunks for version '${versionId}' already have matching embeddings in generation '${generation.id.value}'. Idempotently skipping generation.`,
        );
        job.complete();
        await this.jobRepo.save(job);
        return {
          indexed: true,
          chunkCount: allChunks.length,
          embeddingModel: generation.profile.modelName,
          notes: 'All chunks already indexed with identical content fingerprints.',
        };
      }

      // 6. Generate embeddings strictly OUTSIDE any database transaction
      await this.checkCancellation(options);

      const pipelineResult = await this.pipelineService.generateEmbeddings({
        tenantId,
        documentId,
        documentVersionId: versionId,
        generationId: generation.id.value,
        profile: generation.profile,
        chunks: unindexedChunks,
        batchSize: job.batchSize,
        signal: options.signal,
        isCancelled: options.isCancelled,
      });

      // 7. Persist batch transactionally (atomic write + progress recording)
      await this.persistBatchTransactionally(pipelineResult, generation, job, allChunks.length);

      const hasFailures = pipelineResult.failedChunks.length > 0;
      return {
        indexed: !hasFailures,
        chunkCount: pipelineResult.successfulEmbeddings.length,
        embeddingModel: generation.profile.modelName,
        notes: hasFailures
          ? `Indexing completed with ${pipelineResult.failedChunks.length} failed chunks.`
          : `Successfully indexed ${pipelineResult.successfulEmbeddings.length} chunks.`,
      };
    } catch (error: unknown) {
      await this.handleJobFailure(job, error);
      throw error;
    }
  }

  // --- Private Helpers & Workflow Implementation ---

  private async resolveOrProvisionGeneration(
    tenantId: string,
    requestedGenerationId?: string,
  ): Promise<IndexGeneration> {
    const cleanTenantId = tenantId.trim();

    if (requestedGenerationId) {
      const cleanGenId = requestedGenerationId.trim();
      const existing = await this.generationRepo.findById(cleanGenId);
      if (!existing) {
        throw new IndexGenerationNotFoundException(cleanGenId);
      }
      if (existing.tenantId !== cleanTenantId) {
        throw new IndexGenerationIneligibleException(
          cleanGenId,
          existing.status,
          `Generation belongs to tenant '${existing.tenantId}', not '${cleanTenantId}'`,
        );
      }
      if (
        existing.status === IndexGenerationStatus.RETIRED ||
        existing.status === IndexGenerationStatus.FAILED ||
        existing.status === IndexGenerationStatus.CANCELLED
      ) {
        throw new IndexGenerationIneligibleException(
          cleanGenId,
          existing.status,
          'Retired, failed, or cancelled generations cannot receive new vectors.',
        );
      }
      return existing;
    }

    // Check for currently active generation for tenant
    const active = await this.generationRepo.findActiveByTenantId(cleanTenantId);
    if (active) {
      return active;
    }

    // Check for existing building generation
    const generations = await this.generationRepo.listByTenantId(cleanTenantId);
    const building = generations.find(
      (g) =>
        g.status === IndexGenerationStatus.BUILDING || g.status === IndexGenerationStatus.DRAFT,
    );
    if (building) {
      if (building.status === IndexGenerationStatus.DRAFT) {
        building.startBuilding();
        await this.generationRepo.save(building);
      }
      return building;
    }

    // Provision new initial generation
    const latestGenNum = await this.generationRepo.findLatestGenerationNumber(cleanTenantId);
    const newGen = IndexGeneration.create({
      tenantId: cleanTenantId,
      generationNumber: latestGenNum + 1,
      profile: EmbeddingProfile.bgeM3DenseDefault(),
    });
    newGen.startBuilding();
    await this.generationRepo.save(newGen);

    this.logger.log(
      `Provisioned new index generation '${newGen.id.value}' (Gen #${newGen.generationNumber}) for tenant '${cleanTenantId}'.`,
    );
    return newGen;
  }

  private async acquireOrClaimJob(
    tenantId: string,
    versionId: string,
    generationId: string,
    profileId: string,
  ): Promise<VectorIndexingJob | null> {
    const activeJob = await this.jobRepo.findActiveByScope(
      VectorIndexingScope.DOCUMENT_VERSION,
      versionId,
      generationId,
    );

    if (activeJob) {
      if (activeJob.status === VectorIndexingJobStatus.RUNNING) {
        return null; // Already running
      }
      return await this.jobRepo.claimJob(activeJob.id);
    }

    const newJob = VectorIndexingJob.create({
      tenantId,
      scope: VectorIndexingScope.DOCUMENT_VERSION,
      scopeId: versionId,
      generationId,
      profileId,
      batchSize: this.config.embeddingBatchSize ?? 16,
    });
    await this.jobRepo.save(newJob);

    return await this.jobRepo.claimJob(newJob.id);
  }

  private async persistBatchTransactionally(
    result: {
      successfulEmbeddings: readonly import('@kinergy-platform/core').DocumentEmbedding[];
      failedChunks: readonly import('../embedding-generation-pipeline.service').FailedChunkEmbedding[];
      batchCount: number;
    },
    generation: IndexGeneration,
    job: VectorIndexingJob,
    totalExpectedChunks: number,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // a. Persist embeddings via raw SQL with ON CONFLICT
      for (const emb of result.successfulEmbeddings) {
        const vectorLiteral = `[${emb.vector.values.join(',')}]`;
        await tx.$executeRawUnsafe(
          `INSERT INTO "document_embeddings" (
            "id", "chunk_id", "document_id", "document_version_id",
            "index_generation_id", "profile_id", "dimensions",
            "embedding", "content_fingerprint", "created_at"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9, $10)
          ON CONFLICT ("chunk_id", "index_generation_id") DO UPDATE SET
            "embedding" = EXCLUDED."embedding",
            "content_fingerprint" = EXCLUDED."content_fingerprint",
            "dimensions" = EXCLUDED."dimensions",
            "profile_id" = EXCLUDED."profile_id";`,
          emb.id.value,
          emb.chunkId.value,
          emb.documentId,
          emb.documentVersionId,
          emb.indexGenerationId.value,
          emb.embeddingProfileId,
          emb.dimensions,
          vectorLiteral,
          emb.contentFingerprint,
          emb.createdAt,
        );
      }

      // b. Update IndexGeneration counts if in BUILDING status
      if (generation.status === IndexGenerationStatus.BUILDING) {
        await tx.indexGeneration.update({
          where: { id: generation.id.value },
          data: {
            indexedChunkCount: { increment: result.successfulEmbeddings.length },
            failedChunkCount: { increment: result.failedChunks.length },
            version: { increment: 1 },
          },
        });
      }

      // c. Update VectorIndexingJob progress and status
      const totalNowProcessed = job.processedChunks + result.successfulEmbeddings.length;
      const totalNowFailed = job.failedChunks + result.failedChunks.length;
      const isComplete = totalNowProcessed + totalNowFailed >= totalExpectedChunks;

      await tx.vectorIndexingJob.update({
        where: { id: job.id },
        data: {
          processedChunks: totalNowProcessed,
          failedChunks: totalNowFailed,
          currentBatchNumber: { increment: result.batchCount },
          status: isComplete
            ? totalNowFailed > 0 && result.failedChunks.some((f) => f.permanent)
              ? VectorIndexingJobStatus.FAILED
              : VectorIndexingJobStatus.COMPLETED
            : VectorIndexingJobStatus.RUNNING,
          completedAt: isComplete ? new Date() : null,
          failedAt: isComplete && totalNowFailed > 0 ? new Date() : null,
          lastErrorCode: result.failedChunks.length > 0 ? result.failedChunks[0]?.errorCode : null,
          lastErrorMessage:
            result.failedChunks.length > 0 ? result.failedChunks[0]?.errorMessage : null,
        },
      });
    });
  }

  private async handleJobFailure(job: VectorIndexingJob, error: unknown): Promise<void> {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const errorCode =
      error instanceof GenerationCancelledException
        ? VectorIndexingErrorCode.CANCELLED
        : VectorIndexingErrorCode.UNCLASSIFIED;

    try {
      job.fail(errorCode, errorMsg);
      await this.jobRepo.save(job);
    } catch (saveError) {
      this.logger.error(`Failed to record job failure for job '${job.id}': ${saveError}`);
    }
  }

  private async checkCancellation(options: IndexDocumentVersionOptions): Promise<void> {
    if (options.signal?.aborted) {
      throw new GenerationCancelledException('Indexing operation was aborted by signal.');
    }
    if (options.isCancelled) {
      const cancelled = await options.isCancelled();
      if (cancelled) {
        throw new GenerationCancelledException('Indexing operation was cancelled cooperatively.');
      }
    }
  }
}
