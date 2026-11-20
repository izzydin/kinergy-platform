import { Prisma, PrismaClient } from '@prisma/client';
import { IIndexGenerationRepositoryPort } from '../../../../ports/outbound/index-generation-repository.port';
import { IndexGeneration } from '../../../../domain/models/index-generation.aggregate';
import { EmbeddingProfile } from '../../../../domain/value-objects/embedding-profile.vo';
import { IndexGenerationStatus } from '../../../../domain/enums/index-generation-status.enum';
import { NormalizationPolicy } from '../../../../domain/enums/normalization-policy.enum';
import { PoolingStrategy } from '../../../../domain/enums/pooling-strategy.enum';
import { EmbeddingType } from '../../../../domain/enums/embedding-type.enum';
import {
  IndexGenerationNotFoundException,
  DuplicateActiveIndexGenerationException,
  InvalidIndexGenerationTransitionException,
} from '../../../../domain/exceptions/vector-indexing.exceptions';

/**
 * PostgreSQL + Prisma implementation of IIndexGenerationRepositoryPort.
 * Enforces single active generation invariant, optimistic concurrency, and atomic promotion.
 */
export class PrismaIndexGenerationRepository implements IIndexGenerationRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  public async findById(id: string): Promise<IndexGeneration | null> {
    const record = await this.prisma.indexGeneration.findUnique({
      where: { id: id.trim() },
      include: { profile: true },
    });

    if (!record) return null;
    return this.mapToDomain(record);
  }

  public async findActiveByTenantId(tenantId: string): Promise<IndexGeneration | null> {
    const record = await this.prisma.indexGeneration.findFirst({
      where: {
        tenantId: tenantId.trim(),
        status: IndexGenerationStatus.ACTIVE,
      },
      include: { profile: true },
    });

    if (!record) return null;
    return this.mapToDomain(record);
  }

  public async findLatestGenerationNumber(tenantId: string): Promise<number> {
    const latest = await this.prisma.indexGeneration.findFirst({
      where: { tenantId: tenantId.trim() },
      orderBy: { generationNumber: 'desc' },
      select: { generationNumber: true },
    });

    return latest ? latest.generationNumber : 0;
  }

  public async listByTenantId(tenantId: string): Promise<IndexGeneration[]> {
    const records = await this.prisma.indexGeneration.findMany({
      where: { tenantId: tenantId.trim() },
      orderBy: { generationNumber: 'desc' },
      include: { profile: true },
    });

    return records.map((r) => this.mapToDomain(r));
  }

  public async save(generation: IndexGeneration): Promise<void> {
    // 1. Ensure profile exists in persistence
    await this.ensureProfilePersisted(generation.profile);

    // 2. Save generation record
    try {
      await this.prisma.indexGeneration.upsert({
        where: { id: generation.id.value },
        create: {
          id: generation.id.value,
          tenantId: generation.tenantId,
          generationNumber: generation.generationNumber,
          profileId: generation.profile.profileId,
          status: generation.status,
          targetChunkCount: generation.targetChunkCount,
          indexedChunkCount: generation.indexedChunkCount,
          failedChunkCount: generation.failedChunkCount,
          version: generation.version,
          createdAt: generation.createdAt,
          startedAt: generation.startedAt,
          validatedAt: generation.validatedAt,
          activatedAt: generation.activatedAt,
          retiredAt: generation.retiredAt,
          failedAt: generation.failedAt,
          cancelledAt: generation.cancelledAt,
          errorCode: generation.errorCode,
          failureReason: generation.failureReason,
          cancellationReason: generation.cancellationReason,
        },
        update: {
          status: generation.status,
          targetChunkCount: generation.targetChunkCount,
          indexedChunkCount: generation.indexedChunkCount,
          failedChunkCount: generation.failedChunkCount,
          version: generation.version,
          startedAt: generation.startedAt,
          validatedAt: generation.validatedAt,
          activatedAt: generation.activatedAt,
          retiredAt: generation.retiredAt,
          failedAt: generation.failedAt,
          cancelledAt: generation.cancelledAt,
          errorCode: generation.errorCode,
          failureReason: generation.failureReason,
          cancellationReason: generation.cancellationReason,
        },
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DuplicateActiveIndexGenerationException(generation.tenantId, generation.id.value);
      }
      throw error;
    }
  }

  /**
   * Atomically activates a generation and retires any currently active generation for the tenant.
   * Leverages PostgreSQL transaction and the partial unique index guard.
   */
  public async promoteGeneration(generationId: string, tenantId: string): Promise<void> {
    const cleanGenId = generationId.trim();
    const cleanTenantId = tenantId.trim();

    await this.prisma.$transaction(async (tx) => {
      // 1. Verify target generation exists and is valid for promotion
      const target = await tx.indexGeneration.findUnique({
        where: { id: cleanGenId },
      });

      if (!target) {
        throw new IndexGenerationNotFoundException(cleanGenId);
      }

      if (target.tenantId !== cleanTenantId) {
        throw new InvalidIndexGenerationTransitionException(
          target.status,
          IndexGenerationStatus.ACTIVE,
          `Generation belongs to tenant '${target.tenantId}', not '${cleanTenantId}'`,
        );
      }

      if (target.indexedChunkCount === 0) {
        throw new InvalidIndexGenerationTransitionException(
          target.status,
          IndexGenerationStatus.ACTIVE,
          'Cannot promote a generation with 0 indexed chunks',
        );
      }

      // 2. Retire currently active generation for this tenant (if any)
      const currentActive = await tx.indexGeneration.findFirst({
        where: {
          tenantId: cleanTenantId,
          status: IndexGenerationStatus.ACTIVE,
        },
      });

      if (currentActive && currentActive.id !== cleanGenId) {
        await tx.indexGeneration.update({
          where: { id: currentActive.id },
          data: {
            status: IndexGenerationStatus.RETIRED,
            retiredAt: new Date(),
            version: { increment: 1 },
          },
        });
      }

      // 3. Promote target generation to ACTIVE
      await tx.indexGeneration.update({
        where: { id: cleanGenId },
        data: {
          status: IndexGenerationStatus.ACTIVE,
          activatedAt: new Date(),
          version: { increment: 1 },
        },
      });
    });
  }

  private async ensureProfilePersisted(profile: EmbeddingProfile): Promise<void> {
    await this.prisma.embeddingProfile.upsert({
      where: { profileId: profile.profileId },
      create: {
        profileId: profile.profileId,
        provider: profile.provider,
        modelName: profile.modelName,
        modelVersion: profile.modelVersion,
        modelDigest: profile.modelDigest,
        dimensions: profile.dimensions,
        tokenizerIdentity: profile.tokenizerIdentity,
        normalizationPolicy: profile.normalizationPolicy,
        poolingStrategy: profile.poolingStrategy,
        embeddingType: profile.embeddingType,
        createdAt: profile.createdAt,
      },
      update: {},
    });
  }

  private mapToDomain(record: {
    id: string;
    tenantId: string;
    generationNumber: number;
    status: string;
    targetChunkCount: number;
    indexedChunkCount: number;
    failedChunkCount: number;
    version: number;
    createdAt: Date;
    startedAt: Date | null;
    validatedAt: Date | null;
    activatedAt: Date | null;
    retiredAt: Date | null;
    failedAt: Date | null;
    cancelledAt: Date | null;
    errorCode: string | null;
    failureReason: string | null;
    cancellationReason: string | null;
    profile: {
      profileId: string;
      provider: string;
      modelName: string;
      modelVersion: string;
      modelDigest: string;
      dimensions: number;
      tokenizerIdentity: string;
      normalizationPolicy: unknown;
      poolingStrategy: unknown;
      embeddingType: unknown;
      createdAt: Date;
    };
  }): IndexGeneration {
    const profile = EmbeddingProfile.create({
      profileId: record.profile.profileId,
      provider: record.profile.provider,
      modelName: record.profile.modelName,
      modelVersion: record.profile.modelVersion,
      modelDigest: record.profile.modelDigest,
      dimensions: record.profile.dimensions,
      tokenizerIdentity: record.profile.tokenizerIdentity,
      normalizationPolicy: record.profile.normalizationPolicy as NormalizationPolicy,
      poolingStrategy: record.profile.poolingStrategy as PoolingStrategy,
      embeddingType: record.profile.embeddingType as EmbeddingType,
      createdAt: record.profile.createdAt,
    });

    return IndexGeneration.reconstitute({
      id: record.id,
      tenantId: record.tenantId,
      generationNumber: record.generationNumber,
      profile,
      status: record.status as IndexGenerationStatus,
      targetChunkCount: record.targetChunkCount,
      indexedChunkCount: record.indexedChunkCount,
      failedChunkCount: record.failedChunkCount,
      version: record.version,
      createdAt: record.createdAt,
      startedAt: record.startedAt,
      validatedAt: record.validatedAt,
      activatedAt: record.activatedAt,
      retiredAt: record.retiredAt,
      failedAt: record.failedAt,
      cancelledAt: record.cancelledAt,
      errorCode: record.errorCode,
      failureReason: record.failureReason,
      cancellationReason: record.cancellationReason,
    });
  }
}
