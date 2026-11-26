import { Prisma, PrismaClient } from '@prisma/client';
import { IngestionJob } from '../../../../domain/models/ingestion-job.aggregate';
import { IngestionStatus, isIngestionActive } from '../../../../domain/enums/ingestion-status.enum';
import {
  IIngestionJobRepositoryPort,
  IngestionJobListFilter,
  PaginatedIngestionJobsResult,
} from '../../../../ports/outbound/ingestion-job-repository.port';
import { PrismaIngestionJobMapper } from '../mappers/prisma-ingestion-job.mapper';
import {
  DuplicateActiveIngestionException,
  UnauthorizedDocumentAccessException,
} from '../../../../domain/exceptions/knowledge-document.exceptions';
import { AiDomainException } from '../../../../domain/exceptions/ai-provider.exceptions';

/**
 * PostgreSQL and Prisma implementation of IIngestionJobRepositoryPort.
 * Enforces tenant-scoped job queries, OCC version increments, and active job deduplication.
 */
export class PrismaIngestionJobRepository implements IIngestionJobRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  public async save(job: IngestionJob): Promise<IngestionJob> {
    const jobId = job.id;
    const tenantId = job.tenantId;

    try {
      await this.prisma.$transaction(async (tx) => {
        // 1. Verify tenant consistency if job already exists
        const existing = await tx.ingestionJob.findUnique({
          where: { id: jobId },
          select: { tenantId: true, status: true },
        });

        if (existing && existing.tenantId !== tenantId) {
          throw new UnauthorizedDocumentAccessException(
            `Cross-tenant ingestion job access forbidden. Job '${jobId}' belongs to '${existing.tenantId}'.`,
          );
        }

        // 2. Concurrency guard: If creating or moving to active state, verify no other active job exists
        if (isIngestionActive(job.status)) {
          const conflictingActive = await tx.ingestionJob.findFirst({
            where: {
              documentVersionId: job.documentVersionId,
              id: { not: jobId },
              status: {
                in: [
                  IngestionStatus.UPLOADED,
                  IngestionStatus.VALIDATING,
                  IngestionStatus.PROCESSING,
                  IngestionStatus.INDEXING,
                ],
              },
            },
            select: { id: true },
          });

          if (conflictingActive) {
            throw new DuplicateActiveIngestionException(job.documentVersionId);
          }
        }

        // 3. Upsert job record
        await tx.ingestionJob.upsert({
          where: { id: jobId },
          create: {
            id: jobId,
            tenantId,
            documentId: job.documentId,
            documentVersionId: job.documentVersionId,
            status: PrismaIngestionJobMapper.toPrismaStatus(job.status),
            attemptCount: job.attemptCount,
            maxAttempts: job.maxAttempts,
            lastErrorCode: job.lastErrorCode,
            lastErrorMessage: job.lastErrorMessage,
            version: job.version,
            createdAt: job.createdAt,
            startedAt: job.startedAt,
            completedAt: job.completedAt,
            nextRetryAt: job.nextRetryAt,
            cancelledAt: job.cancelledAt,
            cancellationReason: job.cancellationReason,
          },
          update: {
            status: PrismaIngestionJobMapper.toPrismaStatus(job.status),
            attemptCount: job.attemptCount,
            maxAttempts: job.maxAttempts,
            lastErrorCode: job.lastErrorCode,
            lastErrorMessage: job.lastErrorMessage,
            version: job.version,
            startedAt: job.startedAt,
            completedAt: job.completedAt,
            nextRetryAt: job.nextRetryAt,
            cancelledAt: job.cancelledAt,
            cancellationReason: job.cancellationReason,
          },
        });
      });

      return job;
    } catch (error: unknown) {
      if (error instanceof AiDomainException) {
        throw error;
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = String(error.meta?.target || '');
        if (
          target.includes('unique_active_ingestion_per_version') ||
          target.includes('document_version_id')
        ) {
          throw new DuplicateActiveIngestionException(job.documentVersionId);
        }
      }

      throw error;
    }
  }

  public async findById(tenantId: string, id: string): Promise<IngestionJob | null> {
    if (!id || !tenantId) return null;

    const raw = await this.prisma.ingestionJob.findFirst({
      where: {
        id: id.trim(),
        tenantId: tenantId.trim(),
      },
    });

    if (!raw) return null;
    return PrismaIngestionJobMapper.toDomain(raw);
  }

  public async findByVersionId(tenantId: string, versionId: string): Promise<IngestionJob[]> {
    if (!versionId || !tenantId) return [];

    const records = await this.prisma.ingestionJob.findMany({
      where: {
        documentVersionId: versionId.trim(),
        tenantId: tenantId.trim(),
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => PrismaIngestionJobMapper.toDomain(r));
  }

  public async findByDocumentId(tenantId: string, documentId: string): Promise<IngestionJob[]> {
    if (!documentId || !tenantId) return [];

    const records = await this.prisma.ingestionJob.findMany({
      where: {
        documentId: documentId.trim(),
        tenantId: tenantId.trim(),
      },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => PrismaIngestionJobMapper.toDomain(r));
  }

  public async findAll(
    tenantId: string,
    filter?: IngestionJobListFilter,
  ): Promise<PaginatedIngestionJobsResult> {
    if (!tenantId) return { items: [], total: 0 };

    const where: Prisma.IngestionJobWhereInput = {
      tenantId: tenantId.trim(),
    };

    if (filter?.status) {
      where.status = PrismaIngestionJobMapper.toPrismaStatus(filter.status);
    }
    if (filter?.documentId) {
      where.documentId = filter.documentId.trim();
    }
    if (filter?.documentVersionId) {
      where.documentVersionId = filter.documentVersionId.trim();
    }

    const limit = Math.max(1, Math.min(100, filter?.limit ?? 20));
    const offset = Math.max(0, filter?.offset ?? 0);
    const orderByField = filter?.orderBy || 'createdAt';
    const orderDirection = filter?.orderDirection || 'desc';

    const [records, total] = await Promise.all([
      this.prisma.ingestionJob.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { [orderByField]: orderDirection },
      }),
      this.prisma.ingestionJob.count({ where }),
    ]);

    return {
      items: records.map((r) => PrismaIngestionJobMapper.toDomain(r)),
      total,
    };
  }

  public async findActiveJobByVersionId(
    tenantId: string,
    versionId: string,
  ): Promise<IngestionJob | null> {
    if (!versionId || !tenantId) return null;

    const raw = await this.prisma.ingestionJob.findFirst({
      where: {
        documentVersionId: versionId.trim(),
        tenantId: tenantId.trim(),
        status: {
          in: [
            IngestionStatus.UPLOADED,
            IngestionStatus.VALIDATING,
            IngestionStatus.PROCESSING,
            IngestionStatus.INDEXING,
          ],
        },
      },
    });

    if (!raw) return null;
    return PrismaIngestionJobMapper.toDomain(raw);
  }

  public async findPendingRetries(limit = 10): Promise<IngestionJob[]> {
    const records = await this.prisma.ingestionJob.findMany({
      where: {
        status: IngestionStatus.FAILED,
        nextRetryAt: {
          lte: new Date(),
        },
      },
      orderBy: { nextRetryAt: 'asc' },
      take: limit,
    });

    return records.map((r) => PrismaIngestionJobMapper.toDomain(r));
  }

  public async findPendingUploads(limit = 10): Promise<IngestionJob[]> {
    const records = await this.prisma.ingestionJob.findMany({
      where: {
        status: IngestionStatus.UPLOADED,
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return records.map((r) => PrismaIngestionJobMapper.toDomain(r));
  }

  public async findStaleActiveJobs(olderThan: Date, limit = 10): Promise<IngestionJob[]> {
    const records = await this.prisma.ingestionJob.findMany({
      where: {
        status: {
          in: [IngestionStatus.VALIDATING, IngestionStatus.PROCESSING, IngestionStatus.INDEXING],
        },
        OR: [{ startedAt: { lte: olderThan } }, { startedAt: null, createdAt: { lte: olderThan } }],
      },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return records.map((r) => PrismaIngestionJobMapper.toDomain(r));
  }
}
