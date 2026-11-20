import { Injectable, Inject, Logger } from '@nestjs/common';
import {
  IIndexGenerationRepositoryPort,
  INDEX_GENERATION_REPOSITORY_PORT,
  IVectorIndexingJobRepositoryPort,
  VECTOR_INDEXING_JOB_REPOSITORY_PORT,
  IKnowledgeChunkRepositoryPort,
  IKnowledgeDocumentRepositoryPort,
  IndexGeneration,
  IndexGenerationStatus,
  VectorIndexingJob,
  VectorIndexingScope,
  EmbeddingProfile,
  DocumentChunk,
  GenerationCancelledException,
  IndexGenerationNotFoundException,
  InvalidIndexGenerationTransitionException,
} from '@kinergy-platform/core';
import {
  KNOWLEDGE_DOCUMENT_REPOSITORY,
  KNOWLEDGE_CHUNK_REPOSITORY,
  EMBEDDING_GENERATION_PIPELINE_SERVICE,
  AI_CONFIG_TOKEN,
} from '../../ai.tokens';
import { EmbeddingGenerationPipelineService } from '../embedding-generation-pipeline.service';
import { IndexGenerationCompletenessValidatorService } from './index-generation-completeness-validator.service';
import { AiConfiguration } from '../../config/ai.config';
import { PrismaService } from '../../../platform/persistence/prisma/prisma.service';

export interface ReindexTenantOptions {
  readonly tenantId: string;
  readonly targetProfile?: EmbeddingProfile;
  readonly reason?: string;
  readonly autoActivate?: boolean;
  readonly batchSize?: number;
  readonly signal?: AbortSignal;
  readonly isCancelled?: () => Promise<boolean>;
}

export interface IndexReindexingResult {
  readonly tenantId: string;
  readonly newGenerationId: string;
  readonly previousGenerationId: string | null;
  readonly profileId: string;
  readonly totalChunksAccounted: number;
  readonly totalChunksIndexed: number;
  readonly activated: boolean;
  readonly durationMs: number;
}

/**
 * Service that orchestrates zero-downtime index re-indexing, profile migration,
 * atomic activation, and safe rollback to preserved generations.
 */
@Injectable()
export class IndexReindexingService {
  private readonly logger = new Logger(IndexReindexingService.name);

  constructor(
    @Inject(INDEX_GENERATION_REPOSITORY_PORT)
    private readonly generationRepo: IIndexGenerationRepositoryPort,
    @Inject(VECTOR_INDEXING_JOB_REPOSITORY_PORT)
    private readonly jobRepo: IVectorIndexingJobRepositoryPort,
    @Inject(KNOWLEDGE_CHUNK_REPOSITORY)
    private readonly chunkRepo: IKnowledgeChunkRepositoryPort,
    @Inject(KNOWLEDGE_DOCUMENT_REPOSITORY)
    private readonly documentRepo: IKnowledgeDocumentRepositoryPort,
    @Inject(EMBEDDING_GENERATION_PIPELINE_SERVICE)
    private readonly pipelineService: EmbeddingGenerationPipelineService,
    private readonly completenessValidator: IndexGenerationCompletenessValidatorService,
    @Inject(AI_CONFIG_TOKEN)
    private readonly config: AiConfiguration,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Re-indexes an entire tenant corpus into a newly provisioned generation.
   * The existing ACTIVE generation continues serving live queries uninterrupted.
   */
  public async reindexTenant(options: ReindexTenantOptions): Promise<IndexReindexingResult> {
    const startTime = Date.now();
    const cleanTenantId = options.tenantId.trim();
    const autoActivate = options.autoActivate ?? true;
    const batchSize = options.batchSize ?? this.config.embeddingBatchSize ?? 16;

    this.logger.log(
      `Starting background tenant re-indexing for tenant '${cleanTenantId}' (reason: ${options.reason || 'Not specified'})...`,
    );

    if (options.signal?.aborted || options.isCancelled?.()) {
      throw new GenerationCancelledException('Re-indexing cancelled before execution');
    }

    // 1. Resolve currently ACTIVE generation (remains untouched during building)
    const activeGen = await this.generationRepo.findActiveByTenantId(cleanTenantId);
    const previousGenId = activeGen ? activeGen.id.value : null;

    // 2. Resolve target EmbeddingProfile
    const profile = options.targetProfile ?? EmbeddingProfile.bgeM3DenseDefault();

    // 3. Provision new IndexGeneration
    const nextGenNum = (await this.generationRepo.findLatestGenerationNumber(cleanTenantId)) + 1;
    const newGen = IndexGeneration.create({
      tenantId: cleanTenantId,
      generationNumber: nextGenNum,
      profile,
    });
    newGen.startBuilding();
    await this.generationRepo.save(newGen);

    // 4. Gather all active non-deleted chunks for tenant
    const rawDocuments = await this.documentRepo.findAll(cleanTenantId, { includeDeleted: false });
    const documents = Array.isArray(rawDocuments) ? rawDocuments : [];
    const allEligibleChunks: DocumentChunk[] = [];

    for (const doc of documents) {
      if (doc.isDeleted()) continue;
      const currentVersionId = doc.currentVersionId;
      if (!currentVersionId) continue;

      const chunks = await this.chunkRepo.findByVersionId(cleanTenantId, currentVersionId);
      allEligibleChunks.push(...chunks);
    }

    newGen.setTargetChunkCount(allEligibleChunks.length);
    await this.generationRepo.save(newGen);

    this.logger.log(
      `Provisioned Gen #${newGen.generationNumber} ('${newGen.id.value}') for tenant '${cleanTenantId}': targeting ${allEligibleChunks.length} chunks.`,
    );

    if (allEligibleChunks.length === 0) {
      return {
        tenantId: cleanTenantId,
        newGenerationId: newGen.id.value,
        previousGenerationId: previousGenId,
        profileId: profile.profileId,
        totalChunksAccounted: 0,
        totalChunksIndexed: 0,
        activated: false,
        durationMs: Date.now() - startTime,
      };
    }

    // 5. Create durable VectorIndexingJob for generation scope
    const job = VectorIndexingJob.create({
      tenantId: cleanTenantId,
      scope: VectorIndexingScope.INDEX_GENERATION,
      scopeId: newGen.id.value,
      generationId: newGen.id,
      profileId: profile.profileId,
      batchSize,
      totalChunks: allEligibleChunks.length,
    });
    await this.jobRepo.save(job);
    const claimedJob = await this.jobRepo.claimJob(job.id);
    const activeJob = claimedJob ?? job;

    // 6. Generate embeddings and persist in bounded batches
    const totalBatches = Math.ceil(allEligibleChunks.length / batchSize);
    let totalIndexed = 0;

    for (let b = 0; b < totalBatches; b++) {
      await this.checkCancellation(options);

      const start = b * batchSize;
      const batchChunks = allEligibleChunks.slice(start, start + batchSize);

      // Model inference occurs OUTSIDE DB transaction
      const pipelineResult = await this.pipelineService.generateEmbeddings({
        tenantId: cleanTenantId,
        documentId: batchChunks[0]?.documentId || 'batch-reindex',
        documentVersionId: batchChunks[0]?.documentVersionId || 'batch-reindex',
        generationId: newGen.id.value,
        profile,
        chunks: batchChunks,
        batchSize,
        signal: options.signal,
        isCancelled: options.isCancelled,
      });

      // Transactional persistence
      await this.prisma.$transaction(async (tx) => {
        for (const emb of pipelineResult.successfulEmbeddings) {
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

        await tx.indexGeneration.update({
          where: { id: newGen.id.value },
          data: {
            indexedChunkCount: { increment: pipelineResult.successfulEmbeddings.length },
            failedChunkCount: { increment: pipelineResult.failedChunks.length },
            version: { increment: 1 },
          },
        });

        await tx.vectorIndexingJob.update({
          where: { id: activeJob.id },
          data: {
            processedChunks: { increment: pipelineResult.successfulEmbeddings.length },
            failedChunks: { increment: pipelineResult.failedChunks.length },
            currentBatchNumber: { increment: 1 },
          },
        });
      });

      newGen.recordProgress(
        pipelineResult.successfulEmbeddings.length,
        pipelineResult.failedChunks.length,
      );

      totalIndexed += pipelineResult.successfulEmbeddings.length;
    }

    // 7. Complete job record
    activeJob.complete();
    await this.jobRepo.save(activeJob);

    // 8. Completeness Validation
    await this.completenessValidator.assertComplete(newGen.id.value);

    // 9. Transition to VALIDATING
    newGen.startValidation();
    await this.generationRepo.save(newGen);

    // 10. Atomic Activation (if autoActivate requested)
    let activated = false;
    if (autoActivate) {
      await this.generationRepo.promoteGeneration(newGen.id.value, cleanTenantId);
      activated = true;
      this.logger.log(
        `Atomic activation SUCCESS: Gen #${newGen.generationNumber} is now ACTIVE for tenant '${cleanTenantId}'.`,
      );
    }

    return {
      tenantId: cleanTenantId,
      newGenerationId: newGen.id.value,
      previousGenerationId: previousGenId,
      profileId: profile.profileId,
      totalChunksAccounted: allEligibleChunks.length,
      totalChunksIndexed: totalIndexed,
      activated,
      durationMs: Date.now() - startTime,
    };
  }

  /**
   * Performs an instant, zero-downtime rollback to a previously preserved generation.
   * Zero vectors are recomputed or re-persisted.
   */
  public async rollback(
    tenantId: string,
    targetGenerationId: string,
    reason = 'Rollback to previously validated generation',
  ): Promise<void> {
    const cleanTenantId = tenantId.trim();
    const cleanTargetId = targetGenerationId.trim();

    this.logger.warn(
      `Initiating rollback to generation '${cleanTargetId}' for tenant '${cleanTenantId}' (reason: ${reason})...`,
    );

    const targetGen = await this.generationRepo.findById(cleanTargetId);
    if (!targetGen) {
      throw new IndexGenerationNotFoundException(cleanTargetId);
    }

    if (targetGen.tenantId !== cleanTenantId) {
      throw new InvalidIndexGenerationTransitionException(
        targetGen.status,
        IndexGenerationStatus.ACTIVE,
        `Target generation belongs to tenant '${targetGen.tenantId}', not '${cleanTenantId}'`,
      );
    }

    if (targetGen.status !== IndexGenerationStatus.RETIRED) {
      throw new InvalidIndexGenerationTransitionException(
        targetGen.status,
        IndexGenerationStatus.ACTIVE,
        `Only RETIRED generations can be rolled back to. Current status: '${targetGen.status}'`,
      );
    }

    // Verify target generation completeness before rolling back
    await this.completenessValidator.assertComplete(cleanTargetId);

    // Atomically swap generations
    await this.generationRepo.promoteGeneration(cleanTargetId, cleanTenantId);

    this.logger.log(
      `Rollback SUCCESS: Generation '${cleanTargetId}' is now ACTIVE for tenant '${cleanTenantId}'.`,
    );
  }

  private async checkCancellation(options: ReindexTenantOptions): Promise<void> {
    if (options.signal?.aborted) {
      throw new GenerationCancelledException('Tenant re-indexing was aborted by signal.');
    }
    if (options.isCancelled) {
      const cancelled = await options.isCancelled();
      if (cancelled) {
        throw new GenerationCancelledException('Tenant re-indexing was cancelled cooperatively.');
      }
    }
  }
}
