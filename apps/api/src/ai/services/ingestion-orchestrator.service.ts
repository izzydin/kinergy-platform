import { createHash } from 'crypto';
import { Injectable, Inject, Logger, Optional } from '@nestjs/common';
import {
  IKnowledgeDocumentRepositoryPort,
  IIngestionJobRepositoryPort,
  IngestionJob,
  IngestionStatus,
  IDocumentIndexingPort,
  DOCUMENT_INDEXING_PORT,
  UnauthorizedDocumentAccessException,
  DocumentSecurityRiskException,
} from '@kinergy-platform/core';
import {
  ObjectStoragePort,
  OBJECT_STORAGE_PORT,
} from '../../platform/storage/ports/object-storage.port';
import {
  KNOWLEDGE_DOCUMENT_REPOSITORY,
  INGESTION_JOB_REPOSITORY,
  DOCUMENT_CONTENT_VALIDATOR,
} from '../ai.tokens';
import { IngestionRetryPolicy, IngestionErrorCode } from './ingestion-retry.policy';
import { DocumentProcessingPipelineService } from './document-processing-pipeline.service';
import { DocumentContentValidatorService } from './document-content-validator.service';
import {
  IMalwareScannerPort,
  MALWARE_SCANNER_PORT,
  MalwareScanStatus,
} from '../ports/malware-scanner.port';

/**
 * Ingestion Orchestrator Service.
 * Manages the asynchronous lifecycle execution of IngestionJob aggregates:
 * UPLOADED -> VALIDATING -> PROCESSING -> INDEXING -> READY.
 * Handles retries with exponential backoff and jitter, crash recovery, and cooperative cancellation.
 */
@Injectable()
export class IngestionOrchestratorService {
  private readonly logger = new Logger(IngestionOrchestratorService.name);
  private readonly inFlightJobs = new Set<string>();

  constructor(
    @Inject(KNOWLEDGE_DOCUMENT_REPOSITORY)
    private readonly documentRepo: IKnowledgeDocumentRepositoryPort,
    @Inject(INGESTION_JOB_REPOSITORY)
    private readonly jobRepo: IIngestionJobRepositoryPort,
    @Inject(OBJECT_STORAGE_PORT)
    private readonly storagePort: ObjectStoragePort,
    @Inject(DOCUMENT_INDEXING_PORT)
    @Optional()
    private readonly indexingPort?: IDocumentIndexingPort,
    @Optional()
    private readonly pipeline?: DocumentProcessingPipelineService,
    @Optional()
    @Inject(DOCUMENT_CONTENT_VALIDATOR)
    private readonly contentValidator?: DocumentContentValidatorService,
    @Optional()
    @Inject(MALWARE_SCANNER_PORT)
    private readonly malwareScanner?: IMalwareScannerPort,
  ) {}

  /**
   * Orchestrates the complete processing pipeline for an ingestion job asynchronously.
   * Idempotent: If the job is already completed, cancelled, or currently processing, returns safely.
   */
  public async processJob(jobId: string, tenantId?: string): Promise<IngestionJob> {
    if (this.inFlightJobs.has(jobId)) {
      this.logger.debug(
        `Job '${jobId}' is already being processed by this worker. Skipping redundant invocation.`,
      );
      const existing = tenantId ? await this.jobRepo.findById(tenantId, jobId) : null;
      if (existing) return existing;
    }

    this.inFlightJobs.add(jobId);

    try {
      return await this.executePipeline(jobId, tenantId);
    } finally {
      this.inFlightJobs.delete(jobId);
    }
  }

  /**
   * Pipeline execution with state checkpoints and failure recovery.
   */
  private async executePipeline(jobId: string, tenantId?: string): Promise<IngestionJob> {
    // 1. Fetch current job state from authoritative persistence
    let job: IngestionJob | null;

    if (tenantId) {
      job = await this.jobRepo.findById(tenantId, jobId);
    } else {
      // Background recovery without explicit caller tenant:
      // Search pending retries first, then pending uploads
      const pending = await this.jobRepo.findPendingRetries(100);
      const foundPending = pending.find((j) => j.id === jobId);
      if (foundPending) {
        job = foundPending;
      } else {
        const pendingUploads = await this.jobRepo.findPendingUploads(100);
        job = pendingUploads.find((j) => j.id === jobId) ?? null;
      }
    }

    if (!job) {
      this.logger.warn(`Ingestion job '${jobId}' not found for execution.`);
      throw new Error(`Ingestion job '${jobId}' not found.`);
    }

    // Authoritative tenant derived strictly from the persisted IngestionJob record
    const authoritativeTenantId = job.tenantId;

    // Fail-closed verification: If caller provided a mismatched tenantId, reject immediately (Anti-BOLA / payload tampering)
    if (tenantId && tenantId.trim() !== authoritativeTenantId) {
      this.logger.error(
        `[SECURITY] Tenant mismatch detected for job '${jobId}'. Supplied: '${tenantId}', Authoritative: '${authoritativeTenantId}'.`,
      );
      throw new UnauthorizedDocumentAccessException(
        `Cross-tenant job execution rejected for job '${jobId}'.`,
      );
    }

    const tId = authoritativeTenantId;

    // 2. Terminal state check (Idempotency)
    if (job.isTerminal()) {
      this.logger.debug(
        `Job '${jobId}' is already in terminal state '${job.status}'. Skipping execution.`,
      );
      return job;
    }

    try {
      // =========================================================================
      // Stage 1: VALIDATING
      // =========================================================================
      job = await this.checkCancellationOrRefresh(tId, jobId, job);
      if (job.status === IngestionStatus.CANCELLED) return job;

      if (job.status === IngestionStatus.UPLOADED) {
        job.startValidation();
        job = await this.jobRepo.save(job);
        this.logger.log(
          `Job '${jobId}' transitioned to VALIDATING (attempt ${job.attemptCount}/${job.maxAttempts}).`,
        );
      }

      // Authoritative ownership & state validation: Verify document and version exist in DB under same tenant
      const document = await this.documentRepo.findById(tId, job.documentId);
      if (!document || document.isDeleted()) {
        throw new Error(`Referenced document '${job.documentId}' does not exist or was deleted.`);
      }

      // Invariant: Verify parent document tenant matches job tenant
      if (document.tenantId !== tId) {
        throw new UnauthorizedDocumentAccessException(
          `Document tenant '${document.tenantId}' does not match job tenant '${tId}'.`,
        );
      }

      const version = document.getVersionById(job.documentVersionId);
      if (!version) {
        throw new Error(`Referenced document version '${job.documentVersionId}' does not exist.`);
      }

      // Verify file exists in object storage
      const fileExists = await this.storagePort.exists(tId, version.storageKey);
      if (!fileExists) {
        throw new Error(
          `Storage object '${version.storageKey}' was not found in storage repository.`,
        );
      }

      // =========================================================================
      // Stage 2: PROCESSING
      // =========================================================================
      job = await this.checkCancellationOrRefresh(tId, jobId, job);
      if (job.status === IngestionStatus.CANCELLED) return job;

      // Authoritative checkpoint: Re-validate document state prior to text extraction and chunk persistence
      const docProcessing = await this.documentRepo.findById(tId, job.documentId);
      if (!docProcessing || docProcessing.isDeleted()) {
        throw new Error(`Referenced document '${job.documentId}' does not exist or was deleted.`);
      }
      if (docProcessing.tenantId !== tId) {
        throw new UnauthorizedDocumentAccessException(
          `Document tenant '${docProcessing.tenantId}' does not match job tenant '${tId}'.`,
        );
      }

      // In PROCESSING stage: verify file is accessible, matches checksum, and passes security validation
      const streamMeta = await this.storagePort.download(tId, version.storageKey);
      if (!streamMeta || !streamMeta.data) {
        throw new Error(`Failed to read content stream for storage key '${version.storageKey}'.`);
      }

      const buffer = await this.readStreamToBuffer(streamMeta.data);

      // Checksum integrity verification: Ensure stored file exactly matches authoritative version hash
      const actualHash = createHash('sha256').update(buffer).digest('hex');
      if (version.checksum && actualHash.toLowerCase() !== version.checksum.toLowerCase()) {
        this.logger.error(
          `[SECURITY] Checksum mismatch on doc '${job.documentId}' v'${version.id}': expected '${version.checksum}', computed '${actualHash}'.`,
        );
        throw new Error(
          `Document checksum validation failed against stored object: expected ${version.checksum}, actual ${actualHash}`,
        );
      }

      // Content & structural format validation
      if (this.contentValidator) {
        this.contentValidator.validate({
          buffer,
          originalFileName: version.originalFileName,
          declaredMimeType: version.mimeType,
        });
      }

      // Malware scanning and threat defense
      if (this.malwareScanner) {
        const scan = await this.malwareScanner.scanBuffer(buffer, {
          versionId: version.id,
          checksum: version.checksum,
        });

        if (
          scan.status === MalwareScanStatus.INFECTED ||
          scan.status === MalwareScanStatus.SUSPICIOUS
        ) {
          this.logger.warn(
            `[SECURITY] Malware detected in document '${job.documentId}' v'${version.id}': ${scan.threatFound}. Quarantining document.`,
          );
          docProcessing.softDelete('SYSTEM_MALWARE_QUARANTINE');
          await this.documentRepo.save(docProcessing);
          throw new DocumentSecurityRiskException(
            `Document quarantined due to detected malware threat: ${scan.threatFound ?? 'suspicious payload'}`,
          );
        }

        if (
          scan.status === MalwareScanStatus.UNSCANNABLE ||
          scan.status === MalwareScanStatus.ERROR
        ) {
          this.logger.warn(
            `[SECURITY] Malware scanner failed closed for document '${job.documentId}': ${scan.status}.`,
          );
          throw new DocumentSecurityRiskException(
            `Malware scanner failed closed: file is unscannable or scanner daemon error.`,
          );
        }
      }

      // Re-verify document state after security evaluation
      const refreshedDoc = await this.documentRepo.findById(tId, job.documentId);
      if (!refreshedDoc || refreshedDoc.isDeleted()) {
        throw new Error(`Referenced document '${job.documentId}' does not exist or was deleted.`);
      }

      if (job.status === IngestionStatus.VALIDATING) {
        job.startProcessing();
        job = await this.jobRepo.save(job);
        this.logger.log(`Job '${jobId}' transitioned to PROCESSING.`);
      }

      // Execute document processing pipeline (extraction, normalization, language detection, chunking, persistence)
      if (this.pipeline) {
        await this.checkCancellationOrRefresh(tId, jobId, job);

        await this.pipeline.processDocument({
          tenantId: tId,
          documentId: job.documentId,
          versionId: job.documentVersionId,
          versionNumber: version.versionNumber,
          mimeType: version.mimeType,
          buffer,
          isCancelled: async () => {
            const refreshed = await this.jobRepo.findById(tId, jobId);
            return refreshed?.status === IngestionStatus.CANCELLED;
          },
        });
      }

      // =========================================================================
      // Stage 3: INDEXING
      // =========================================================================
      job = await this.checkCancellationOrRefresh(tId, jobId, job);
      if (job.status === IngestionStatus.CANCELLED) return job;

      // Authoritative checkpoint: Re-validate document state prior to vector generation and persistence
      const docIndexing = await this.documentRepo.findById(tId, job.documentId);
      if (!docIndexing || docIndexing.isDeleted()) {
        throw new Error(`Referenced document '${job.documentId}' does not exist or was deleted.`);
      }
      if (docIndexing.tenantId !== tId) {
        throw new UnauthorizedDocumentAccessException(
          `Document tenant '${docIndexing.tenantId}' does not match job tenant '${tId}'.`,
        );
      }

      if (job.status === IngestionStatus.PROCESSING) {
        job.startIndexing();
        job = await this.jobRepo.save(job);
        this.logger.log(`Job '${jobId}' transitioned to INDEXING.`);
      }

      // Invoke downstream indexing port
      if (this.indexingPort) {
        await this.indexingPort.indexDocument({
          tenantId: tId,
          documentId: job.documentId,
          versionId: job.documentVersionId,
          versionNumber: version.versionNumber,
          mimeType: version.mimeType,
          storageKey: version.storageKey,
        });
      }

      // =========================================================================
      // Stage 4: READY
      // =========================================================================
      job = await this.checkCancellationOrRefresh(tId, jobId, job);
      if (job.status === IngestionStatus.CANCELLED) return job;

      // Final state check: Ensure document was not deleted or modified during vector indexing
      const docReady = await this.documentRepo.findById(tId, job.documentId);
      if (!docReady || docReady.isDeleted()) {
        throw new Error(`Referenced document '${job.documentId}' was deleted before completion.`);
      }

      if (job.status === IngestionStatus.INDEXING) {
        job.markReady();
        job = await this.jobRepo.save(job);
        this.logger.log(`Job '${jobId}' successfully completed: READY.`);
      }

      return job;
    } catch (error: unknown) {
      return await this.handlePipelineFailure(tId, jobId, job, error);
    }
  }

  /**
   * Cooperative cancellation check: Refreshes job from database to detect out-of-band user cancellation.
   */
  private async checkCancellationOrRefresh(
    tenantId: string,
    jobId: string,
    inMemoryJob: IngestionJob,
  ): Promise<IngestionJob> {
    const refreshed = await this.jobRepo.findById(tenantId, jobId);
    if (!refreshed) return inMemoryJob;

    if (refreshed.status === IngestionStatus.CANCELLED) {
      this.logger.log(
        `Job '${jobId}' was cancelled cooperatively. Aborting further execution stages.`,
      );
      return refreshed;
    }

    return inMemoryJob;
  }

  /**
   * Resilient failure handling:
   * - Never overwrites a CANCELLED job.
   * - Classifies error into retryable vs non-retryable.
   * - Retries with exponential backoff if retryable and attempts remain.
   * - Fails permanently if non-retryable or max attempts exhausted.
   * - STRICT INVARIANT: Source document and version are NEVER touched or deleted on failure.
   */
  private async handlePipelineFailure(
    tenantId: string,
    jobId: string,
    currentJob: IngestionJob,
    error: unknown,
  ): Promise<IngestionJob> {
    // 1. Check if job was cancelled in the database during processing
    const refreshed = await this.jobRepo.findById(tenantId, jobId);
    if (refreshed && refreshed.status === IngestionStatus.CANCELLED) {
      this.logger.log(
        `Job '${jobId}' was cancelled during step execution. Preserving CANCELLED state.`,
      );
      return refreshed;
    }

    const classification = IngestionRetryPolicy.classifyError(error);

    // 2. Retryable failure handling
    if (classification.isRetryable && currentJob.attemptCount < currentJob.maxAttempts) {
      const nextRetryAt = IngestionRetryPolicy.computeNextRetryAt(currentJob.attemptCount);

      // In our domain model, retry() transitions FAILED -> VALIDATING.
      // We first fail this attempt with transient error, then mark retry with nextRetryAt
      currentJob.fail(classification.code, classification.message);
      currentJob.retry(nextRetryAt);

      const saved = await this.jobRepo.save(currentJob);
      this.logger.warn(
        `Job '${jobId}' transient failure (${classification.code}). Scheduled retry ${saved.attemptCount}/${saved.maxAttempts} for ${nextRetryAt.toISOString()}.`,
      );
      return saved;
    }

    // 3. Permanent failure or retry exhaustion
    const finalCode =
      currentJob.attemptCount >= currentJob.maxAttempts && classification.isRetryable
        ? IngestionErrorCode.MAX_ATTEMPTS_EXCEEDED
        : classification.code;

    const finalMessage =
      currentJob.attemptCount >= currentJob.maxAttempts && classification.isRetryable
        ? `Exceeded maximum retry attempts (${currentJob.maxAttempts}). Last error: ${classification.message}`
        : classification.message;

    currentJob.fail(finalCode, finalMessage);
    const failedJob = await this.jobRepo.save(currentJob);

    this.logger.error(
      `Job '${jobId}' permanently FAILED [${finalCode}]: ${finalMessage}. Source document preserved intact.`,
    );

    return failedJob;
  }

  /**
   * Explicitly retries a failed ingestion job.
   */
  public async retryJob(tenantId: string, jobId: string): Promise<IngestionJob> {
    const job = await this.jobRepo.findById(tenantId, jobId);
    if (!job) {
      throw new Error(`Ingestion job '${jobId}' not found.`);
    }

    job.retry();
    const saved = await this.jobRepo.save(job);

    // Asynchronously trigger execution
    setImmediate(() => {
      this.processJob(saved.id, tenantId).catch((err) => {
        this.logger.error(`Background retry execution failed for job '${saved.id}': ${err}`);
      });
    });

    return saved;
  }

  /**
   * Helper to convert an incoming NodeJS readable stream into an in-memory Uint8Array/Buffer.
   */
  private async readStreamToBuffer(stream: unknown): Promise<Buffer> {
    if (Buffer.isBuffer(stream)) {
      return stream;
    }
    const chunks: Buffer[] = [];
    return new Promise<Buffer>((resolve, reject) => {
      const s = stream as { on?: (event: string, listener: (...args: unknown[]) => void) => void };
      if (!s || typeof s.on !== 'function') {
        resolve(Buffer.from([]));
        return;
      }
      s.on('data', (chunk: unknown) => {
        if (Buffer.isBuffer(chunk)) {
          chunks.push(chunk);
        } else if (chunk instanceof Uint8Array) {
          chunks.push(Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength));
        } else if (typeof chunk === 'string') {
          chunks.push(Buffer.from(chunk));
        }
      });
      s.on('end', () => resolve(Buffer.concat(chunks)));
      s.on('error', (err: unknown) => reject(err));
    });
  }

  /**
   * Explicitly cancels an active ingestion job.
   */
  public async cancelJob(tenantId: string, jobId: string, reason?: string): Promise<IngestionJob> {
    const job = await this.jobRepo.findById(tenantId, jobId);
    if (!job) {
      throw new Error(`Ingestion job '${jobId}' not found.`);
    }

    job.cancel(reason);
    return await this.jobRepo.save(job);
  }
}
