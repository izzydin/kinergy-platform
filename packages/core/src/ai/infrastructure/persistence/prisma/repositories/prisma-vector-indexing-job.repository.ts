import { PrismaClient, VectorIndexingJob as PrismaJobModel } from '@prisma/client';
import { IVectorIndexingJobRepositoryPort } from '../../../../ports/outbound/vector-indexing-job-repository.port';
import {
  VectorIndexingJob,
  VectorIndexingScope,
  VectorIndexingJobStatus,
} from '../../../../domain/models/vector-indexing-job.model';

/**
 * PostgreSQL + Prisma implementation of IVectorIndexingJobRepositoryPort.
 * Provides durable persistence, optimistic atomic job claiming, and lease querying.
 */
export class PrismaVectorIndexingJobRepository implements IVectorIndexingJobRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  public async save(job: VectorIndexingJob): Promise<VectorIndexingJob> {
    const record = await this.prisma.vectorIndexingJob.upsert({
      where: { id: job.id },
      create: {
        id: job.id,
        tenantId: job.tenantId,
        scope: job.scope as unknown as PrismaJobModel['scope'],
        scopeId: job.scopeId,
        generationId: job.generationId.value,
        profileId: job.profileId,
        status: job.status as unknown as PrismaJobModel['status'],
        batchSize: job.batchSize,
        totalChunks: job.totalChunks,
        processedChunks: job.processedChunks,
        failedChunks: job.failedChunks,
        currentBatchNumber: job.currentBatchNumber,
        attemptCount: job.attemptCount,
        maxAttempts: job.maxAttempts,
        lastErrorCode: job.lastErrorCode,
        lastErrorMessage: job.lastErrorMessage,
        createdAt: job.createdAt,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        failedAt: job.failedAt,
        cancelledAt: job.cancelledAt,
      },
      update: {
        status: job.status as unknown as PrismaJobModel['status'],
        batchSize: job.batchSize,
        totalChunks: job.totalChunks,
        processedChunks: job.processedChunks,
        failedChunks: job.failedChunks,
        currentBatchNumber: job.currentBatchNumber,
        attemptCount: job.attemptCount,
        maxAttempts: job.maxAttempts,
        lastErrorCode: job.lastErrorCode,
        lastErrorMessage: job.lastErrorMessage,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        failedAt: job.failedAt,
        cancelledAt: job.cancelledAt,
      },
    });

    return this.mapToDomain(record);
  }

  public async findById(id: string): Promise<VectorIndexingJob | null> {
    const record = await this.prisma.vectorIndexingJob.findUnique({
      where: { id: id.trim() },
    });
    if (!record) return null;
    return this.mapToDomain(record);
  }

  public async findActiveByScope(
    scope: VectorIndexingScope,
    scopeId: string,
    generationId: string,
  ): Promise<VectorIndexingJob | null> {
    const record = await this.prisma.vectorIndexingJob.findFirst({
      where: {
        scope: scope as unknown as PrismaJobModel['scope'],
        scopeId: scopeId.trim(),
        generationId: generationId.trim(),
        status: {
          in: [
            VectorIndexingJobStatus.PENDING as unknown as PrismaJobModel['status'],
            VectorIndexingJobStatus.RUNNING as unknown as PrismaJobModel['status'],
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) return null;
    return this.mapToDomain(record);
  }

  public async claimJob(id: string): Promise<VectorIndexingJob | null> {
    const cleanId = id.trim();
    // Atomic conditional update to prevent double-claiming
    const updateResult = await this.prisma.vectorIndexingJob.updateMany({
      where: {
        id: cleanId,
        status: VectorIndexingJobStatus.PENDING as unknown as PrismaJobModel['status'],
      },
      data: {
        status: VectorIndexingJobStatus.RUNNING as unknown as PrismaJobModel['status'],
        startedAt: new Date(),
        attemptCount: { increment: 1 },
      },
    });

    if (updateResult.count === 0) {
      return null;
    }

    const updated = await this.prisma.vectorIndexingJob.findUnique({
      where: { id: cleanId },
    });

    return updated ? this.mapToDomain(updated) : null;
  }

  public async listStaleJobs(staleBefore: Date, limit = 50): Promise<VectorIndexingJob[]> {
    const records = await this.prisma.vectorIndexingJob.findMany({
      where: {
        status: VectorIndexingJobStatus.RUNNING as unknown as PrismaJobModel['status'],
        startedAt: { lte: staleBefore },
      },
      take: limit,
      orderBy: { startedAt: 'asc' },
    });

    return records.map((r) => this.mapToDomain(r));
  }

  public async listByGenerationId(generationId: string): Promise<VectorIndexingJob[]> {
    const records = await this.prisma.vectorIndexingJob.findMany({
      where: { generationId: generationId.trim() },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.mapToDomain(r));
  }

  public async cancelJobsForDocument(documentId: string, reason: string): Promise<number> {
    const res = await this.prisma.vectorIndexingJob.updateMany({
      where: {
        scopeId: documentId.trim(),
        status: {
          in: [
            VectorIndexingJobStatus.PENDING as unknown as PrismaJobModel['status'],
            VectorIndexingJobStatus.RUNNING as unknown as PrismaJobModel['status'],
          ],
        },
      },
      data: {
        status: VectorIndexingJobStatus.CANCELLED as unknown as PrismaJobModel['status'],
        lastErrorMessage: reason,
        cancelledAt: new Date(),
      },
    });
    return res.count;
  }

  public async cancelJobsForVersion(versionId: string, reason: string): Promise<number> {
    const res = await this.prisma.vectorIndexingJob.updateMany({
      where: {
        scope: VectorIndexingScope.DOCUMENT_VERSION as unknown as PrismaJobModel['scope'],
        scopeId: versionId.trim(),
        status: {
          in: [
            VectorIndexingJobStatus.PENDING as unknown as PrismaJobModel['status'],
            VectorIndexingJobStatus.RUNNING as unknown as PrismaJobModel['status'],
          ],
        },
      },
      data: {
        status: VectorIndexingJobStatus.CANCELLED as unknown as PrismaJobModel['status'],
        lastErrorMessage: reason,
        cancelledAt: new Date(),
      },
    });
    return res.count;
  }

  private mapToDomain(record: PrismaJobModel): VectorIndexingJob {
    return VectorIndexingJob.reconstitute({
      id: record.id,
      tenantId: record.tenantId,
      scope: record.scope as unknown as VectorIndexingScope,
      scopeId: record.scopeId,
      generationId: record.generationId,
      profileId: record.profileId,
      status: record.status as unknown as VectorIndexingJobStatus,
      batchSize: record.batchSize,
      totalChunks: record.totalChunks,
      processedChunks: record.processedChunks,
      failedChunks: record.failedChunks,
      currentBatchNumber: record.currentBatchNumber,
      attemptCount: record.attemptCount,
      maxAttempts: record.maxAttempts,
      lastErrorCode: record.lastErrorCode,
      lastErrorMessage: record.lastErrorMessage,
      createdAt: record.createdAt,
      startedAt: record.startedAt,
      completedAt: record.completedAt,
      failedAt: record.failedAt,
      cancelledAt: record.cancelledAt,
    });
  }
}
