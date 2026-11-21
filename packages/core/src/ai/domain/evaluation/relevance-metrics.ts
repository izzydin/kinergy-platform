/**
 * Individual evaluation metrics for a single query under a specific threshold and top-K.
 */
export interface QueryEvaluationResult {
  readonly queryId: string;
  readonly queryText: string;
  readonly queryCategory?: string; // 'exact' | 'synonym' | 'paraphrase' | 'multilingual' | 'ambiguous' | 'distractor' | 'section'
  readonly domainCategory?: string;
  readonly threshold: number;
  readonly k: number;
  readonly precisionAtK: number;
  readonly recallAtK: number;
  readonly mrr: number;
  readonly ndcgAtK: number;
  readonly relevantRetrievedCount: number;
  readonly totalRetrievedCount: number;
  readonly totalRelevantCount: number;
  readonly isNoAnswerQuery: boolean;
  readonly isNoAnswerCorrect: boolean;
  readonly latencyMs?: number;
  readonly retrievedChunkIds?: readonly string[];
}

export interface CategoryMetricSummary {
  readonly count: number;
  readonly meanPrecisionAtK: number;
  readonly meanRecallAtK: number;
  readonly meanMRR: number;
  readonly meanNDCGAtK: number;
}

/**
 * Aggregated benchmark summary across an entire evaluation dataset
 * for a specific candidate threshold and top-K limit.
 */
export interface BenchmarkSummary {
  readonly systemType?: 'semantic' | 'keyword' | 'hybrid';
  readonly threshold: number;
  readonly k: number;
  readonly totalQueries: number;
  readonly positiveQueries: number;
  readonly negativeQueries: number;
  readonly meanPrecisionAtK: number;
  readonly meanRecallAtK: number;
  readonly meanMRR: number;
  readonly meanNDCGAtK: number;
  readonly f1Score: number;
  readonly coverageRate: number;
  readonly falsePositiveCount: number;
  readonly falseNegativeCount: number;
  readonly noAnswerAccuracy: number;
  readonly meanLatencyMs?: number;
  readonly categoryBreakdown?: Readonly<Record<string, CategoryMetricSummary>>;
}

/**
 * Comparative benchmark report contrasting Semantic Retrieval vs. Keyword Search Baseline vs. Hybrid Retrieval.
 */
export interface BenchmarkComparisonReport {
  readonly datasetVersion: string;
  readonly timestamp: string;
  readonly k: number;
  readonly semanticSummary: BenchmarkSummary;
  readonly keywordSummary: BenchmarkSummary;
  readonly hybridSummary?: BenchmarkSummary;
  readonly metricDeltas: {
    readonly precisionDelta: number;
    readonly recallDelta: number;
    readonly mrrDelta: number;
    readonly ndcgDelta: number;
    readonly f1Delta: number;
    readonly coverageDelta: number;
    readonly noAnswerAccuracyDelta: number;
  };
}
