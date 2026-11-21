import {
  QueryEvaluationResult,
  BenchmarkSummary,
  CategoryMetricSummary,
} from './relevance-metrics';
import { LabeledQuery } from './representative-dataset';

export interface ScoredCandidate {
  readonly chunkId: string;
  readonly similarity: number;
}

export class RelevanceEvaluator {
  /**
   * Computes Discounted Cumulative Gain (DCG@K) using graded relevance.
   * Gain formula: (2^rel - 1) / log2(rank + 1)
   */
  public static computeDCG(relevances: readonly number[]): number {
    let dcg = 0;
    for (let i = 0; i < relevances.length; i++) {
      const rel = relevances[i] ?? 0;
      if (rel > 0) {
        const gain = Math.pow(2, rel) - 1;
        const discount = Math.log2(i + 2); // rank is i + 1, log2(rank + 1) = log2(i + 2)
        dcg += gain / discount;
      }
    }
    return dcg;
  }

  /**
   * Computes Normalized Discounted Cumulative Gain (nDCG@K).
   */
  public static computeNDCG(
    retrievedRelevances: readonly number[],
    idealRelevances: readonly number[],
  ): number {
    const dcg = RelevanceEvaluator.computeDCG(retrievedRelevances);
    const sortedIdeal = [...idealRelevances].sort((a, b) => b - a);
    const idcg = RelevanceEvaluator.computeDCG(sortedIdeal.slice(0, retrievedRelevances.length));

    if (idcg === 0) {
      return dcg === 0 ? 1.0 : 0.0;
    }

    return Math.min(1.0, dcg / idcg);
  }

  /**
   * Evaluates a single query against labeled ground truth relevance.
   */
  public static evaluateQuery(params: {
    query: LabeledQuery;
    candidates: readonly ScoredCandidate[];
    threshold: number;
    k: number;
    latencyMs?: number;
  }): QueryEvaluationResult {
    const { query, candidates, threshold, k, latencyMs } = params;

    // 1. Apply relevance threshold filter
    const passingCandidates = candidates.filter((c) => c.similarity >= threshold).slice(0, k);

    const groundTruth = query.groundTruthRelevance;
    const totalRelevant = Object.values(groundTruth).filter(
      (r): r is number => typeof r === 'number' && r > 0,
    ).length;
    const isNoAnswerQuery = totalRelevant === 0;

    // 2. Handle out-of-domain / unanswerable negative queries
    if (isNoAnswerQuery) {
      const isClean = passingCandidates.length === 0;
      return {
        queryId: query.queryId,
        queryText: query.queryText,
        queryCategory: query.queryCategory,
        domainCategory: query.domainCategory,
        threshold,
        k,
        precisionAtK: isClean ? 1.0 : 0.0,
        recallAtK: isClean ? 1.0 : 0.0,
        mrr: isClean ? 1.0 : 0.0,
        ndcgAtK: isClean ? 1.0 : 0.0,
        relevantRetrievedCount: 0,
        totalRetrievedCount: passingCandidates.length,
        totalRelevantCount: 0,
        isNoAnswerQuery: true,
        isNoAnswerCorrect: isClean,
        latencyMs,
        retrievedChunkIds: passingCandidates.map((c) => c.chunkId),
      };
    }

    // 3. Positive in-domain query evaluation
    let relevantRetrieved = 0;
    let firstRelevantRank = 0;
    const retrievedRelevances: number[] = [];

    for (let i = 0; i < passingCandidates.length; i++) {
      const candidate = passingCandidates[i]!;
      const rel = groundTruth[candidate.chunkId] ?? 0;
      retrievedRelevances.push(rel);

      if (rel > 0) {
        relevantRetrieved++;
        if (firstRelevantRank === 0) {
          firstRelevantRank = i + 1;
        }
      }
    }

    // Pad with 0s up to passingCandidates.length for DCG calculation
    const allIdealRelevances = Object.values(groundTruth).filter(
      (r): r is number => typeof r === 'number' && r > 0,
    );
    const ndcgAtK = RelevanceEvaluator.computeNDCG(retrievedRelevances, allIdealRelevances);

    const precisionAtK =
      passingCandidates.length > 0 ? relevantRetrieved / passingCandidates.length : 0.0;
    const recallAtK = totalRelevant > 0 ? relevantRetrieved / totalRelevant : 0.0;
    const mrr = firstRelevantRank > 0 ? 1.0 / firstRelevantRank : 0.0;

    return {
      queryId: query.queryId,
      queryText: query.queryText,
      queryCategory: query.queryCategory,
      domainCategory: query.domainCategory,
      threshold,
      k,
      precisionAtK: Math.round(precisionAtK * 1000) / 1000,
      recallAtK: Math.round(recallAtK * 1000) / 1000,
      mrr: Math.round(mrr * 1000) / 1000,
      ndcgAtK: Math.round(ndcgAtK * 1000) / 1000,
      relevantRetrievedCount: relevantRetrieved,
      totalRetrievedCount: passingCandidates.length,
      totalRelevantCount: totalRelevant,
      isNoAnswerQuery: false,
      isNoAnswerCorrect: false,
      latencyMs,
      retrievedChunkIds: passingCandidates.map((c) => c.chunkId),
    };
  }

  /**
   * Aggregates individual query evaluation results into a comprehensive BenchmarkSummary.
   */
  public static aggregateMetrics(
    results: readonly QueryEvaluationResult[],
    threshold: number,
    k: number,
    systemType?: 'semantic' | 'keyword' | 'hybrid',
  ): BenchmarkSummary {
    if (results.length === 0) {
      return {
        systemType,
        threshold,
        k,
        totalQueries: 0,
        positiveQueries: 0,
        negativeQueries: 0,
        meanPrecisionAtK: 0,
        meanRecallAtK: 0,
        meanMRR: 0,
        meanNDCGAtK: 0,
        f1Score: 0,
        coverageRate: 0,
        falsePositiveCount: 0,
        falseNegativeCount: 0,
        noAnswerAccuracy: 0,
      };
    }

    const positiveResults = results.filter((r) => !r.isNoAnswerQuery);
    const negativeResults = results.filter((r) => r.isNoAnswerQuery);

    const posCount = positiveResults.length;
    const negCount = negativeResults.length;

    // Precision, Recall, MRR, nDCG averaged over positive queries
    const meanPrecision =
      posCount > 0 ? positiveResults.reduce((acc, r) => acc + r.precisionAtK, 0) / posCount : 1.0;
    const meanRecall =
      posCount > 0 ? positiveResults.reduce((acc, r) => acc + r.recallAtK, 0) / posCount : 1.0;
    const meanMRR =
      posCount > 0 ? positiveResults.reduce((acc, r) => acc + r.mrr, 0) / posCount : 1.0;
    const meanNDCG =
      posCount > 0 ? positiveResults.reduce((acc, r) => acc + r.ndcgAtK, 0) / posCount : 1.0;

    // F1 Score
    const f1Score =
      meanPrecision + meanRecall > 0
        ? (2 * meanPrecision * meanRecall) / (meanPrecision + meanRecall)
        : 0;

    // Coverage: proportion of positive queries that retrieved at least 1 relevant chunk
    const coveredPositiveQueries = positiveResults.filter(
      (r) => r.relevantRetrievedCount > 0,
    ).length;
    const coverageRate = posCount > 0 ? coveredPositiveQueries / posCount : 1.0;

    // False Positives on negative queries (returned chunks when 0 should be returned)
    const falsePositiveCount = negativeResults.filter((r) => !r.isNoAnswerCorrect).length;
    const noAnswerAccuracy = negCount > 0 ? (negCount - falsePositiveCount) / negCount : 1.0;

    // False Negatives on positive queries (retrieved 0 relevant chunks)
    const falseNegativeCount = positiveResults.filter((r) => r.relevantRetrievedCount === 0).length;

    // Mean Latency
    const totalLatency = results.reduce((acc, r) => acc + (r.latencyMs ?? 0), 0);
    const meanLatencyMs =
      results.length > 0 ? Math.round((totalLatency / results.length) * 100) / 100 : undefined;

    // Category breakdown
    const categoryMap: Record<string, QueryEvaluationResult[]> = {};
    for (const r of results) {
      const cat = r.queryCategory || 'uncategorized';
      if (!categoryMap[cat]) categoryMap[cat] = [];
      categoryMap[cat]!.push(r);
    }

    const categoryBreakdown: Record<string, CategoryMetricSummary> = {};
    for (const [cat, catResults] of Object.entries(categoryMap)) {
      const posCat = catResults.filter((r) => !r.isNoAnswerQuery);
      const cPos = posCat.length;
      categoryBreakdown[cat] = {
        count: catResults.length,
        meanPrecisionAtK:
          cPos > 0
            ? Math.round((posCat.reduce((a, b) => a + b.precisionAtK, 0) / cPos) * 1000) / 1000
            : 1.0,
        meanRecallAtK:
          cPos > 0
            ? Math.round((posCat.reduce((a, b) => a + b.recallAtK, 0) / cPos) * 1000) / 1000
            : 1.0,
        meanMRR:
          cPos > 0 ? Math.round((posCat.reduce((a, b) => a + b.mrr, 0) / cPos) * 1000) / 1000 : 1.0,
        meanNDCGAtK:
          cPos > 0
            ? Math.round((posCat.reduce((a, b) => a + b.ndcgAtK, 0) / cPos) * 1000) / 1000
            : 1.0,
      };
    }

    return {
      systemType,
      threshold,
      k,
      totalQueries: results.length,
      positiveQueries: posCount,
      negativeQueries: negCount,
      meanPrecisionAtK: Math.round(meanPrecision * 1000) / 1000,
      meanRecallAtK: Math.round(meanRecall * 1000) / 1000,
      meanMRR: Math.round(meanMRR * 1000) / 1000,
      meanNDCGAtK: Math.round(meanNDCG * 1000) / 1000,
      f1Score: Math.round(f1Score * 1000) / 1000,
      coverageRate: Math.round(coverageRate * 1000) / 1000,
      falsePositiveCount,
      falseNegativeCount,
      noAnswerAccuracy: Math.round(noAnswerAccuracy * 1000) / 1000,
      meanLatencyMs,
      categoryBreakdown,
    };
  }
}
