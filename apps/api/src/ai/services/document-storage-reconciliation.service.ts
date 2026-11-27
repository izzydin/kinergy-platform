import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import {
  IKnowledgeDocumentRepositoryPort,
  IIngestionJobRepositoryPort,
  KnowledgeDocument,
} from '@kinergy-platform/core';
import {
  OBJECT_STORAGE_PORT,
  ObjectStoragePort,
} from '../../platform/storage/ports/object-storage.port';
import { KNOWLEDGE_DOCUMENT_REPOSITORY, INGESTION_JOB_REPOSITORY } from '../ai.tokens';
import { TempFileStorageService } from './temp-file-storage.service';
import { IngestionErrorCode, IngestionRetryPolicy } from './ingestion-retry.policy';

export interface StorageReconciliationOptions {
  dryRun?: boolean;
}

export interface StorageReconciliationReport {
  tenantId: string;
  totalCandidates: number;
  orphansFound: number;
  orphansDeleted: number;
  preservedKeys: number;
  reconciledAt: Date;
  details: {
    key: string;
    action: 'PRESERVED' | 'ORPHAN_DELETED' | 'ORPHAN_FLAGGED' | 'DELETE_FAILED';
    reason?: string;
  }[];
}

export interface IngestionJobReconciliationReport {
  tenantId: string;
  stalledJobsFound: number;
  jobsRecovered: number;
  jobsTerminatedDueToSecurity: number;
  reconciledAt: Date;
  details: {
    jobId: string;
    outcome: 'RECOVERED_RETRY' | 'TERMINATED_SECURITY_RISK' | 'TERMINATED_MAX_ATTEMPTS';
    reason: string;
  }[];
}

/**
 * Service responsible for safe reconciliation of orphaned storage objects,
 * abandoned temporary scratch files, and interrupted ingestion records.
 *
 * Guarantees:
 * 1. Strict Tenant Scoping: Operations are strictly isolated by tenant boundary.
 * 2. Active Reference Protection: Never deletes a storage object referenced by any
 *    document version (including soft-deleted versions preserved for audit).
 * 3. Dry-Run Capability: Allows non-destructive auditing of candidate orphaned files.
 * 4. Stale Scratch Reclamation: Purges ephemeral scratch directories left behind by
 *    crashes or aborted subprocesses.
 * 5. Quarantine & Security Invariant Enforcement: Detects stalled jobs referencing
 *    quarantined documents and fails them permanently with SECURITY_VIOLATION.
 */
@Injectable()
export class DocumentStorageReconciliationService {
  private readonly logger = new Logger(DocumentStorageReconciliationService.name);

  constructor(
    @Inject(OBJECT_STORAGE_PORT)
    private readonly storagePort: ObjectStoragePort,
    @Inject(KNOWLEDGE_DOCUMENT_REPOSITORY)
    private readonly documentRepo: IKnowledgeDocumentRepositoryPort,
    @Inject(INGESTION_JOB_REPOSITORY)
    private readonly jobRepo: IIngestionJobRepositoryPort,
    @Optional()
    private readonly tempFileStorage?: TempFileStorageService,
  ) {}

  /**
   * Reconciles candidate storage keys against authoritative document version records.
   * Only unreferenced storage objects within the tenant boundary are flagged or deleted.
   */
  public async reconcileOrphanedStorageKeys(
    tenantId: string,
    candidateKeys: string[],
    options?: StorageReconciliationOptions,
  ): Promise<StorageReconciliationReport> {
    if (!tenantId || tenantId.trim().length === 0) {
      throw new Error('Tenant ID is required for storage reconciliation.');
    }

    const dryRun = options?.dryRun ?? false;
    const report: StorageReconciliationReport = {
      tenantId,
      totalCandidates: candidateKeys.length,
      orphansFound: 0,
      orphansDeleted: 0,
      preservedKeys: 0,
      reconciledAt: new Date(),
      details: [],
    };

    if (candidateKeys.length === 0) {
      return report;
    }

    // 1. Fetch all documents for this tenant (including soft-deleted versions to protect audit trails)
    const allDocs: KnowledgeDocument[] = await this.documentRepo.findAll(tenantId, {
      includeDeleted: true,
    });

    // 2. Build set of authoritative storage keys actively referenced in persistence
    const referencedKeys = new Set<string>();
    for (const doc of allDocs) {
      for (const ver of doc.getAllVersions()) {
        if (ver.storageKey) {
          referencedKeys.add(ver.storageKey);
        }
      }
    }

    // 3. Inspect each candidate key
    for (const key of candidateKeys) {
      if (referencedKeys.has(key)) {
        report.preservedKeys++;
        report.details.push({
          key,
          action: 'PRESERVED',
          reason: 'Key is referenced by an authoritative document version record.',
        });
      } else {
        // Orphan detected
        report.orphansFound++;

        if (dryRun) {
          report.details.push({
            key,
            action: 'ORPHAN_FLAGGED',
            reason: 'Key is unreferenced by any document version (dry-run mode).',
          });
        } else {
          try {
            await this.storagePort.delete(tenantId, key);
            report.orphansDeleted++;
            report.details.push({
              key,
              action: 'ORPHAN_DELETED',
              reason: 'Unreferenced storage object successfully deleted.',
            });
            this.logger.log(
              `[RECONCILIATION] Successfully deleted orphaned storage key '${key}' for tenant '${tenantId}'.`,
            );
          } catch (deleteError) {
            this.logger.error(
              `[RECONCILIATION] Failed to delete orphaned key '${key}' for tenant '${tenantId}': ${deleteError}`,
            );
            report.details.push({
              key,
              action: 'DELETE_FAILED',
              reason: `Storage delete operation failed: ${deleteError}`,
            });
          }
        }
      }
    }

    return report;
  }

  /**
   * Reclaims stale ephemeral scratch files from TempFileStorage older than configured threshold.
   */
  public async reconcileStaleScratchFiles(maxAgeMs?: number): Promise<number> {
    if (!this.tempFileStorage) {
      this.logger.debug('TempFileStorageService not available for scratch reconciliation.');
      return 0;
    }

    const cleaned = await this.tempFileStorage.cleanupStaleScratch(maxAgeMs);
    if (cleaned > 0) {
      this.logger.log(`[RECONCILIATION] Reclaimed ${cleaned} stale temporary scratch directories.`);
    }
    return cleaned;
  }

  /**
   * Reconciles stalled ingestion jobs for a tenant, evaluating quarantine and document state.
   */
  public async reconcileStalledJobs(
    tenantId: string,
    staleThresholdMs: number = 300_000, // 5 minutes default
  ): Promise<IngestionJobReconciliationReport> {
    const olderThan = new Date(Date.now() - staleThresholdMs);
    const staleJobs = await this.jobRepo.findStaleActiveJobs(olderThan, 100);
    const tenantStaleJobs = staleJobs.filter((j) => j.tenantId === tenantId);

    const report: IngestionJobReconciliationReport = {
      tenantId,
      stalledJobsFound: tenantStaleJobs.length,
      jobsRecovered: 0,
      jobsTerminatedDueToSecurity: 0,
      reconciledAt: new Date(),
      details: [],
    };

    for (const job of tenantStaleJobs) {
      const doc = await this.documentRepo.findById(tenantId, job.documentId);

      // Check if document was quarantined or deleted while job was stalled
      if (!doc || doc.isDeleted()) {
        job.fail(
          IngestionErrorCode.SECURITY_VIOLATION,
          'Referenced document is deleted or in quarantine. Ingestion terminated.',
        );
        await this.jobRepo.save(job);
        report.jobsTerminatedDueToSecurity++;
        report.details.push({
          jobId: job.id,
          outcome: 'TERMINATED_SECURITY_RISK',
          reason: 'Underlying document is deleted or quarantined.',
        });
        continue;
      }

      // Check retry limits
      if (job.attemptCount < job.maxAttempts) {
        const nextRetryAt = IngestionRetryPolicy.computeNextRetryAt(job.attemptCount);
        job.fail(
          IngestionErrorCode.WORKER_CRASH_RECOVERED,
          'Job stalled due to worker crash or disruption. Recovered by watchdog reconciliation.',
        );
        job.retry(nextRetryAt);
        await this.jobRepo.save(job);
        report.jobsRecovered++;
        report.details.push({
          jobId: job.id,
          outcome: 'RECOVERED_RETRY',
          reason: `Scheduled retry ${job.attemptCount}/${job.maxAttempts} for ${nextRetryAt.toISOString()}.`,
        });
      } else {
        job.fail(
          IngestionErrorCode.MAX_ATTEMPTS_EXCEEDED,
          `Job stalled and exceeded maximum retry attempts (${job.maxAttempts}).`,
        );
        await this.jobRepo.save(job);
        report.details.push({
          jobId: job.id,
          outcome: 'TERMINATED_MAX_ATTEMPTS',
          reason: 'Maximum retry attempts exhausted.',
        });
      }
    }

    return report;
  }
}
