import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export type GenerationOutcome =
  | 'SUCCESS'
  | 'ABSTAINED'
  | 'UNGROUNDED'
  | 'TIMEOUT'
  | 'CANCELLED'
  | 'PROVIDER_ERROR'
  | 'OVERLOADED'
  | 'VALIDATION_ERROR';

export interface RecordGenerationLogProps {
  requestId: string;
  correlationId?: string;
  tenantId: string;
  userId?: string;
  query: string;
  modelIdentifier: string;
  promptVersion: string;
  retrievalCount: number;
  contextChunkCount: number;
  inputTokenEstimate: number;
  outputTokenCount: number;
  retrievalDurationMs: number;
  contextDurationMs: number;
  generationDurationMs: number;
  validationDurationMs: number;
  totalDurationMs: number;
  retryCount: number;
  outcome: GenerationOutcome;
  citationCount: number;
  isGrounded: boolean;
  abstentionReason?: string;
  failureCategory?: string;
  errorMessage?: string;
}

export interface StructuredGenerationLog {
  timestamp: string;
  event: 'ai_grounded_generation';
  requestId: string;
  correlationId: string;
  tenantId: string;
  userPseudonym: string;
  queryHash: string;
  queryLength: number;
  modelIdentifier: string;
  promptVersion: string;
  retrievalCount: number;
  contextChunkCount: number;
  inputTokenEstimate: number;
  outputTokenCount: number;
  retrievalDurationMs: number;
  contextDurationMs: number;
  generationDurationMs: number;
  validationDurationMs: number;
  totalDurationMs: number;
  retryCount: number;
  outcome: GenerationOutcome;
  timeoutStatus: boolean;
  abstentionStatus: boolean;
  citationCount: number;
  isGrounded: boolean;
  abstentionReason?: string;
  failureCategory?: string;
  errorMessage?: string;
}

export interface GenerationMetricsSummary {
  readonly totalRequests: number;
  readonly successCount: number;
  readonly abstainedCount: number;
  readonly ungroundedCount: number;
  readonly timeoutCount: number;
  readonly cancelledCount: number;
  readonly providerErrorCount: number;
  readonly overloadedCount: number;
  readonly validationErrorCount: number;
  readonly totalErrors: number;
  readonly errorRate: number;
  readonly groundedRate: number;
  readonly abstentionRate: number;
  readonly latency: {
    readonly p50: number;
    readonly p95: number;
    readonly p99: number;
    readonly min: number;
    readonly max: number;
    readonly mean: number;
  };
}

/**
 * Production Generation Observability Service.
 *
 * Responsibilities:
 * 1. Emits structured JSON telemetry for each grounded answer generation attempt.
 * 2. Anonymizes user identifiers using keyed HMAC-SHA256 pseudonyms.
 * 3. Hashes query texts with SHA-256 (never logging raw text or clinical chunks).
 * 4. Maintains an in-memory ring buffer for latency percentile and rate calculations.
 * 5. Strictly excludes API keys, secrets, full prompts, and PHI from logs.
 */
@Injectable()
export class GenerationObservabilityService {
  private readonly logger = new Logger(GenerationObservabilityService.name);
  private static readonly MAX_RING_BUFFER_SIZE = 500;
  private readonly logBuffer: StructuredGenerationLog[] = [];

  public recordGeneration(props: RecordGenerationLogProps): StructuredGenerationLog {
    const correlationId = props.correlationId ?? props.requestId;
    const queryHash = this.computeQueryHash(props.query);
    const userPseudonym = this.computeUserPseudonym(props.userId, props.tenantId);

    const logEntry: StructuredGenerationLog = {
      timestamp: new Date().toISOString(),
      event: 'ai_grounded_generation',
      requestId: props.requestId,
      correlationId,
      tenantId: props.tenantId,
      userPseudonym,
      queryHash,
      queryLength: props.query ? props.query.length : 0,
      modelIdentifier: props.modelIdentifier,
      promptVersion: props.promptVersion,
      retrievalCount: props.retrievalCount,
      contextChunkCount: props.contextChunkCount,
      inputTokenEstimate: props.inputTokenEstimate,
      outputTokenCount: props.outputTokenCount,
      retrievalDurationMs: Math.round(props.retrievalDurationMs),
      contextDurationMs: Math.round(props.contextDurationMs),
      generationDurationMs: Math.round(props.generationDurationMs),
      validationDurationMs: Math.round(props.validationDurationMs),
      totalDurationMs: Math.round(props.totalDurationMs),
      retryCount: props.retryCount,
      outcome: props.outcome,
      timeoutStatus: props.outcome === 'TIMEOUT',
      abstentionStatus: props.outcome === 'ABSTAINED',
      citationCount: props.citationCount,
      isGrounded: props.isGrounded,
      abstentionReason: props.abstentionReason,
      failureCategory: props.failureCategory,
      errorMessage: props.errorMessage,
    };

    // Store in bounded ring buffer
    if (this.logBuffer.length >= GenerationObservabilityService.MAX_RING_BUFFER_SIZE) {
      this.logBuffer.shift();
    }
    this.logBuffer.push(logEntry);

    // Emit structured log
    const json = JSON.stringify(logEntry);
    if (
      props.outcome === 'TIMEOUT' ||
      props.outcome === 'PROVIDER_ERROR' ||
      props.outcome === 'OVERLOADED'
    ) {
      this.logger.error(`[AI_GENERATION] ${json}`);
    } else if (props.outcome === 'ABSTAINED' || props.outcome === 'UNGROUNDED') {
      this.logger.warn(`[AI_GENERATION] ${json}`);
    } else {
      this.logger.log(`[AI_GENERATION] ${json}`);
    }

    return logEntry;
  }

  public getRecentLogs(limit = 100): readonly StructuredGenerationLog[] {
    return this.logBuffer.slice(-limit);
  }

  public getMetricsSummary(): GenerationMetricsSummary {
    const totalRequests = this.logBuffer.length;
    if (totalRequests === 0) {
      return {
        totalRequests: 0,
        successCount: 0,
        abstainedCount: 0,
        ungroundedCount: 0,
        timeoutCount: 0,
        cancelledCount: 0,
        providerErrorCount: 0,
        overloadedCount: 0,
        validationErrorCount: 0,
        totalErrors: 0,
        errorRate: 0,
        groundedRate: 0,
        abstentionRate: 0,
        latency: { p50: 0, p95: 0, p99: 0, min: 0, max: 0, mean: 0 },
      };
    }

    let successCount = 0;
    let abstainedCount = 0;
    let ungroundedCount = 0;
    let timeoutCount = 0;
    let cancelledCount = 0;
    let providerErrorCount = 0;
    let overloadedCount = 0;
    let validationErrorCount = 0;

    const latencies: number[] = [];

    for (const log of this.logBuffer) {
      latencies.push(log.totalDurationMs);
      switch (log.outcome) {
        case 'SUCCESS':
          successCount++;
          break;
        case 'ABSTAINED':
          abstainedCount++;
          break;
        case 'UNGROUNDED':
          ungroundedCount++;
          break;
        case 'TIMEOUT':
          timeoutCount++;
          break;
        case 'CANCELLED':
          cancelledCount++;
          break;
        case 'PROVIDER_ERROR':
          providerErrorCount++;
          break;
        case 'OVERLOADED':
          overloadedCount++;
          break;
        case 'VALIDATION_ERROR':
          validationErrorCount++;
          break;
      }
    }

    const totalErrors = timeoutCount + providerErrorCount + overloadedCount + validationErrorCount;
    const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;
    const groundedRate = totalRequests > 0 ? successCount / totalRequests : 0;
    const abstentionRate = totalRequests > 0 ? abstainedCount / totalRequests : 0;

    latencies.sort((a, b) => a - b);
    const min = latencies[0] ?? 0;
    const max = latencies[latencies.length - 1] ?? 0;
    const mean = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    const p50 = this.getPercentile(latencies, 50);
    const p95 = this.getPercentile(latencies, 95);
    const p99 = this.getPercentile(latencies, 99);

    return {
      totalRequests,
      successCount,
      abstainedCount,
      ungroundedCount,
      timeoutCount,
      cancelledCount,
      providerErrorCount,
      overloadedCount,
      validationErrorCount,
      totalErrors,
      errorRate,
      groundedRate,
      abstentionRate,
      latency: { p50, p95, p99, min, max, mean },
    };
  }

  public clear(): void {
    this.logBuffer.length = 0;
  }

  private computeQueryHash(query: string): string {
    if (!query) return '';
    return crypto.createHash('sha256').update(query.trim().toLowerCase()).digest('hex');
  }

  private computeUserPseudonym(userId: string | undefined, tenantId: string): string {
    if (!userId) return 'anonymous';
    return crypto.createHmac('sha256', tenantId).update(userId).digest('hex').slice(0, 16);
  }

  private getPercentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(idx, sorted.length - 1))] ?? 0;
  }
}
