import {
  IngestionJob as PrismaIngestionJob,
  IngestionStatus as PrismaIngestionStatus,
} from '@prisma/client';
import { IngestionJob } from '../../../../domain/models/ingestion-job.aggregate';
import { IngestionStatus } from '../../../../domain/enums/ingestion-status.enum';

export class PrismaIngestionJobMapper {
  public static toDomain(raw: PrismaIngestionJob): IngestionJob {
    return IngestionJob.reconstitute({
      id: raw.id,
      documentId: raw.documentId,
      documentVersionId: raw.documentVersionId,
      tenantId: raw.tenantId,
      status: raw.status as unknown as IngestionStatus,
      attemptCount: raw.attemptCount,
      maxAttempts: raw.maxAttempts,
      lastErrorCode: raw.lastErrorCode,
      lastErrorMessage: raw.lastErrorMessage,
      version: raw.version,
      createdAt: raw.createdAt,
      startedAt: raw.startedAt,
      completedAt: raw.completedAt,
      nextRetryAt: raw.nextRetryAt,
      cancelledAt: raw.cancelledAt,
      cancellationReason: raw.cancellationReason,
    });
  }

  public static toPrismaStatus(status: IngestionStatus): PrismaIngestionStatus {
    return status as unknown as PrismaIngestionStatus;
  }
}
