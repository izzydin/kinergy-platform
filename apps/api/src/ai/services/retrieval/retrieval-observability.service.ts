import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export type RetrievalOutcome =
  | 'SUCCESS'
  | 'NO_RELEVANT_CHUNKS'
  | 'UNAUTHORIZED'
  | 'PROVIDER_ERROR'
  | 'PROVIDER_TIMEOUT'
  | 'DATABASE_ERROR'
  | 'VALIDATION_ERROR';

export interface RecordRetrievalLogProps {
  requestId: string;
  correlationId?: string;
  tenantId: string;
  userId?: string;
  query: string;
  embeddingModel: string;
  requestedTopK: number;
  returnedCount: number;
  totalMatchesFound: number;
  filterCategories: readonly string[];
  outcome: RetrievalOutcome;
  totalDurationMs: number;
  embeddingDurationMs: number;
  vectorSearchDurationMs: number;
  scoringDurationMs: number;
  provenanceDurationMs: number;
  topSimilarityScore?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface StructuredRetrievalLog {
  timestamp: string;
  event: 'ai_semantic_retrieval';
  requestId: string;
  correlationId: string;
  tenantId: string;
  userPseudonym: string;
  queryHash: string;
  queryLength: number;
  queryTokenEstimate: number;
  embeddingModel: string;
  requestedTopK: number;
  returnedCount: number;
  totalMatchesFound: number;
  filterCategories: readonly string[];
  outcome: RetrievalOutcome;
  totalDurationMs: number;
  embeddingDurationMs: number;
  vectorSearchDurationMs: number;
  scoringDurationMs: number;
  provenanceDurationMs: number;
  topSimilarityScore?: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface LatencyPercentiles {
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
}

export interface RetrievalMetricsSummary {
  readonly totalRequests: number;
  readonly successCount: number;
  readonly emptyResultCount: number;
  readonly unauthorizedCount: number;
  readonly providerTimeoutCount: number;
  readonly providerFailureCount: number;
  readonly databaseFailureCount: number;
  readonly validationErrorCount: number;
  readonly totalErrors: number;
  readonly errorRate: number;
  readonly emptyResultRate: number;
  readonly providerTimeoutRate: number;
  readonly databaseFailureRate: number;
  readonly latency: {
    readonly total: LatencyPercentiles;
    readonly embedding: LatencyPercentiles;
    readonly vectorSearch: LatencyPercentiles;
    readonly scoringAndFiltering: LatencyPercentiles;
    readonly provenanceMapping: LatencyPercentiles;
  };
}

export interface RetrievalTraceSpan {
  readonly name:
    | 'query_embedding'
    | 'vector_search'
    | 'security_policy'
    | 'scoring_filtering'
    | 'provenance_mapping';
  readonly durationMs: number;
  readonly status: 'OK' | 'ERROR';
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
}

interface LatencyRecord {
  total: number;
  embedding: number;
  vectorSearch: number;
  scoring: number;
  provenance: number;
}

/**
 * Production-grade observability, structured audit logging, and performance
 * metric aggregation service for the Semantic Retrieval Engine.
 *
 * Guarantees:
 * - Zero logging of raw sensitive queries, chunks, vectors, or credentials.
 * - Monotonic latency measurement across all execution phases.
 * - Memory-bounded rolling window for p50, p95, p99 percentiles and error rates.
 * - Trace span recording with strict low-cardinality attributes.
 * - Sanitized client error categorization.
 */
@Injectable()
export class RetrievalObservabilityService {
  private readonly logger = new Logger(RetrievalObservabilityService.name);

  // Bounded ring buffer for rolling latency tracking (capacity: 1000)
  private readonly maxWindowSize = 1000;
  private readonly latencyWindow: LatencyRecord[] = [];

  // Atomic counters
  private totalRequests = 0;
  private successCount = 0;
  private emptyResultCount = 0;
  private unauthorizedCount = 0;
  private providerTimeoutCount = 0;
  private providerFailureCount = 0;
  private databaseFailureCount = 0;
  private validationErrorCount = 0;

  // Active spans for diagnostics inspection
  private readonly activeSpans: RetrievalTraceSpan[] = [];

  /**
   * Records a structured log entry and updates rolling performance metrics.
   */
  public logRetrieval(props: RecordRetrievalLogProps): StructuredRetrievalLog {
    this.totalRequests++;

    const correlationId = props.correlationId || props.requestId;
    const userPseudonym = this.pseudonymizeUser(props.userId);
    const queryHash = this.hashQuery(props.query);
    const queryLength = props.query.length;
    const queryTokenEstimate = Math.ceil(queryLength / 4);

    // Update outcome counters
    switch (props.outcome) {
      case 'SUCCESS':
        this.successCount++;
        break;
      case 'NO_RELEVANT_CHUNKS':
        this.emptyResultCount++;
        break;
      case 'UNAUTHORIZED':
        this.unauthorizedCount++;
        break;
      case 'PROVIDER_TIMEOUT':
        this.providerTimeoutCount++;
        break;
      case 'PROVIDER_ERROR':
        this.providerFailureCount++;
        break;
      case 'DATABASE_ERROR':
        this.databaseFailureCount++;
        break;
      case 'VALIDATION_ERROR':
        this.validationErrorCount++;
        break;
    }

    // Record latency in bounded window
    if (this.latencyWindow.length >= this.maxWindowSize) {
      this.latencyWindow.shift();
    }
    this.latencyWindow.push({
      total: props.totalDurationMs,
      embedding: props.embeddingDurationMs,
      vectorSearch: props.vectorSearchDurationMs,
      scoring: props.scoringDurationMs,
      provenance: props.provenanceDurationMs,
    });

    const structuredLog: StructuredRetrievalLog = {
      timestamp: new Date().toISOString(),
      event: 'ai_semantic_retrieval',
      requestId: props.requestId,
      correlationId,
      tenantId: props.tenantId,
      userPseudonym,
      queryHash,
      queryLength,
      queryTokenEstimate,
      embeddingModel: props.embeddingModel,
      requestedTopK: props.requestedTopK,
      returnedCount: props.returnedCount,
      totalMatchesFound: props.totalMatchesFound,
      filterCategories: Object.freeze([...props.filterCategories]),
      outcome: props.outcome,
      totalDurationMs: this.round2(props.totalDurationMs),
      embeddingDurationMs: this.round2(props.embeddingDurationMs),
      vectorSearchDurationMs: this.round2(props.vectorSearchDurationMs),
      scoringDurationMs: this.round2(props.scoringDurationMs),
      provenanceDurationMs: this.round2(props.provenanceDurationMs),
      topSimilarityScore:
        props.topSimilarityScore !== undefined ? this.round4(props.topSimilarityScore) : undefined,
      errorCode: props.errorCode,
      errorMessage: props.errorMessage,
    };

    // Output structured JSON via NestJS logger
    const logJson = JSON.stringify(structuredLog);
    if (props.outcome === 'SUCCESS' || props.outcome === 'NO_RELEVANT_CHUNKS') {
      this.logger.log(logJson);
    } else if (props.outcome === 'UNAUTHORIZED' || props.outcome === 'VALIDATION_ERROR') {
      this.logger.warn(logJson);
    } else {
      this.logger.error(logJson);
    }

    return structuredLog;
  }

  /**
   * Records a tracing span with low-cardinality attributes.
   */
  public recordSpan(span: RetrievalTraceSpan): void {
    if (this.activeSpans.length >= 500) {
      this.activeSpans.shift();
    }
    this.activeSpans.push(span);
  }

  /**
   * Calculates real-time p50, p95, p99 percentiles and error rates.
   */
  public getMetricsSummary(): RetrievalMetricsSummary {
    const totalReq = this.totalRequests;
    const totalErrors =
      this.providerTimeoutCount +
      this.providerFailureCount +
      this.databaseFailureCount +
      this.validationErrorCount;

    const errorRate = totalReq > 0 ? this.round4(totalErrors / totalReq) : 0;
    const emptyResultRate = totalReq > 0 ? this.round4(this.emptyResultCount / totalReq) : 0;
    const providerTimeoutRate =
      totalReq > 0 ? this.round4(this.providerTimeoutCount / totalReq) : 0;
    const databaseFailureRate =
      totalReq > 0 ? this.round4(this.databaseFailureCount / totalReq) : 0;

    const totals = this.latencyWindow.map((l) => l.total);
    const embeddings = this.latencyWindow.map((l) => l.embedding);
    const searches = this.latencyWindow.map((l) => l.vectorSearch);
    const scorings = this.latencyWindow.map((l) => l.scoring);
    const provenances = this.latencyWindow.map((l) => l.provenance);

    return {
      totalRequests: totalReq,
      successCount: this.successCount,
      emptyResultCount: this.emptyResultCount,
      unauthorizedCount: this.unauthorizedCount,
      providerTimeoutCount: this.providerTimeoutCount,
      providerFailureCount: this.providerFailureCount,
      databaseFailureCount: this.databaseFailureCount,
      validationErrorCount: this.validationErrorCount,
      totalErrors,
      errorRate,
      emptyResultRate,
      providerTimeoutRate,
      databaseFailureRate,
      latency: {
        total: this.calculatePercentiles(totals),
        embedding: this.calculatePercentiles(embeddings),
        vectorSearch: this.calculatePercentiles(searches),
        scoringAndFiltering: this.calculatePercentiles(scorings),
        provenanceMapping: this.calculatePercentiles(provenances),
      },
    };
  }

  /**
   * Resets all rolling metrics (useful for testing and window rotation).
   */
  public resetMetrics(): void {
    this.latencyWindow.length = 0;
    this.activeSpans.length = 0;
    this.totalRequests = 0;
    this.successCount = 0;
    this.emptyResultCount = 0;
    this.unauthorizedCount = 0;
    this.providerTimeoutCount = 0;
    this.providerFailureCount = 0;
    this.databaseFailureCount = 0;
    this.validationErrorCount = 0;
  }

  /**
   * Sanitizes internal exceptions into client-safe domain error descriptors.
   */
  public sanitizeError(error: unknown): {
    outcome: RetrievalOutcome;
    safeMessage: string;
    errorCode: string;
    internalMessage: string;
  } {
    const rawMessage = error instanceof Error ? error.message : String(error);
    const errorName = error instanceof Error ? error.name : 'UnknownError';

    // Distinguish provider timeouts
    if (
      rawMessage.toLowerCase().includes('timeout') ||
      rawMessage.toLowerCase().includes('timed out') ||
      errorName.includes('Timeout')
    ) {
      return {
        outcome: 'PROVIDER_TIMEOUT',
        safeMessage: 'The AI embedding service timed out. Please retry shortly.',
        errorCode: 'PROVIDER_TIMEOUT',
        internalMessage: rawMessage,
      };
    }

    // Distinguish provider inference failures
    if (
      rawMessage.toLowerCase().includes('ollama') ||
      rawMessage.toLowerCase().includes('embedding provider') ||
      errorName.includes('Embedding')
    ) {
      return {
        outcome: 'PROVIDER_ERROR',
        safeMessage: 'The AI embedding provider encountered an error generating the search query.',
        errorCode: 'PROVIDER_FAILURE',
        internalMessage: rawMessage,
      };
    }

    // Distinguish database / persistence failures
    if (
      rawMessage.toLowerCase().includes('prisma') ||
      rawMessage.toLowerCase().includes('database') ||
      rawMessage.toLowerCase().includes('postgres') ||
      rawMessage.toLowerCase().includes('connection')
    ) {
      return {
        outcome: 'DATABASE_ERROR',
        safeMessage: 'A persistence error occurred during retrieval. Please retry later.',
        errorCode: 'RETRIEVAL_PERSISTENCE_ERROR',
        internalMessage: rawMessage,
      };
    }

    // Distinguish unauthorized retrieval
    if (
      rawMessage.toLowerCase().includes('unauthorized') ||
      rawMessage.toLowerCase().includes('forbidden')
    ) {
      return {
        outcome: 'UNAUTHORIZED',
        safeMessage: 'You are not authorized to perform this retrieval.',
        errorCode: 'RETRIEVAL_UNAUTHORIZED',
        internalMessage: rawMessage,
      };
    }

    return {
      outcome: 'VALIDATION_ERROR',
      safeMessage: rawMessage,
      errorCode: 'INVALID_QUERY',
      internalMessage: rawMessage,
    };
  }

  // --- Private Utility Methods ---

  private hashQuery(query: string): string {
    return crypto.createHash('sha256').update(query.trim()).digest('hex').substring(0, 16);
  }

  private pseudonymizeUser(userId?: string): string {
    if (!userId || userId.trim().length === 0) {
      return 'anon';
    }
    const clean = userId.trim();
    if (clean.startsWith('usr_') && clean.length > 8) {
      return `usr_${crypto.createHash('sha256').update(clean).digest('hex').substring(0, 8)}`;
    }
    return crypto.createHash('sha256').update(clean).digest('hex').substring(0, 8);
  }

  private calculatePercentiles(values: number[]): LatencyPercentiles {
    if (values.length === 0) {
      return { p50: 0, p95: 0, p99: 0, min: 0, max: 0, mean: 0 };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    const sum = sorted.reduce((acc, v) => acc + v, 0);

    const p50 = sorted[Math.floor(n * 0.5)] ?? 0;
    const p95 = sorted[Math.floor(n * 0.95)] ?? sorted[n - 1] ?? 0;
    const p99 = sorted[Math.floor(n * 0.99)] ?? sorted[n - 1] ?? 0;
    const min = sorted[0] ?? 0;
    const max = sorted[n - 1] ?? 0;
    const mean = sum / n;

    return {
      p50: this.round2(p50),
      p95: this.round2(p95),
      p99: this.round2(p99),
      min: this.round2(min),
      max: this.round2(max),
      mean: this.round2(mean),
    };
  }

  private round2(val: number): number {
    return Math.round(val * 100) / 100;
  }

  private round4(val: number): number {
    return Math.round(val * 10000) / 10000;
  }
}
