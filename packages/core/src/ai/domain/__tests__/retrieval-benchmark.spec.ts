import {
  RetrievalBenchmarkRunner,
  KeywordSearchBaseline,
  VALIDATION_SPLIT_QUERIES,
  HELD_OUT_TEST_SPLIT_QUERIES,
  DEV_SPLIT_QUERIES,
  DATASET_VERSION,
  REPRESENTATIVE_CORPUS,
} from '../evaluation';

describe('AI-06.7 — Retrieval Evaluation Dataset & Keyword Search Baseline Benchmark', () => {
  let runner: RetrievalBenchmarkRunner;
  let keywordBaseline: KeywordSearchBaseline;

  beforeEach(() => {
    runner = new RetrievalBenchmarkRunner();
    keywordBaseline = new KeywordSearchBaseline();
  });

  describe('Part 1 — Representative Dataset Integrity & Domain Coverage', () => {
    it('1. should verify versioned dataset covers all 9 platform operational domains', () => {
      expect(DATASET_VERSION).toBe('KYNERGY_RETRIEVAL_BENCHMARK_V1');
      expect(REPRESENTATIVE_CORPUS.length).toBeGreaterThanOrEqual(18);

      const departments = new Set(REPRESENTATIVE_CORPUS.map((c) => c.department));
      expect(departments).toContain('kinesiology');
      expect(departments).toContain('scheduling');
      expect(departments).toContain('membership');
      expect(departments).toContain('attendance');
      expect(departments).toContain('inventory');
      expect(departments).toContain('billing');
      expect(departments).toContain('rentals');
      expect(departments).toContain('food_services');
      expect(departments).toContain('operations');
    });

    it('2. should verify 3 distinct dataset splits with proper graded relevance', () => {
      expect(DEV_SPLIT_QUERIES.length).toBe(10);
      expect(VALIDATION_SPLIT_QUERIES.length).toBe(15);
      expect(HELD_OUT_TEST_SPLIT_QUERIES.length).toBe(15);

      // Verify dev, val, test splits have mutually exclusive query IDs
      const devIds = new Set(DEV_SPLIT_QUERIES.map((q) => q.queryId));
      const valIds = new Set(VALIDATION_SPLIT_QUERIES.map((q) => q.queryId));
      const testIds = new Set(HELD_OUT_TEST_SPLIT_QUERIES.map((q) => q.queryId));

      for (const id of devIds) {
        expect(valIds.has(id)).toBe(false);
        expect(testIds.has(id)).toBe(false);
      }
      for (const id of valIds) {
        expect(testIds.has(id)).toBe(false);
      }
    });
  });

  describe('Part 2 — Keyword Search Baseline Functionality & Spanish Stemming', () => {
    it('3. should retrieve correct chunk on exact terminology matching', () => {
      const results = keywordBaseline.search('crioterapia e isométricos', 5);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.chunkId).toBe('chk_acl_phase1');
    });

    it('4. should demonstrate keyword limitation on conceptual synonyms and paraphrasing', () => {
      // Query uses "reintegro de dinero" while corpus text uses "reembolsos" and "devoluciones"
      const results = keywordBaseline.search('reintegro de dinero por clases no tomadas', 5);
      // Keyword search yields 0 matches or low score due to vocabulary mismatch
      const hasDirectMatch = results.some((r) => r.chunkId === 'chk_refund_policy');
      expect(hasDirectMatch).toBe(false); // Demonstrates classic lexical vocabulary mismatch
    });

    it('5. should enforce authorization constraints in keyword search', () => {
      // When restricted to a specific document subset, foreign documents are excluded
      const results = keywordBaseline.search('crioterapia', 5, {
        documentIds: ['doc_gym_memberships'], // acl chunk is in doc_acl_protocol
      });
      expect(results.length).toBe(0);
    });
  });

  describe('Part 3 — Comparative Evaluation: Semantic vs. Keyword vs. Hybrid', () => {
    it('6. should execute comparative benchmark on Validation Split and confirm Semantic superiority on synonyms/paraphrases', () => {
      const report = runner.runValidationEvaluation({ k: 5 });

      expect(report.datasetVersion).toBe('KYNERGY_RETRIEVAL_BENCHMARK_V1');
      expect(report.k).toBe(5);

      const sem = report.semanticSummary;
      const kw = report.keywordSummary;
      const hyb = report.hybridSummary!;

      // Semantic Search Assertions:
      expect(sem.meanPrecisionAtK).toBeGreaterThanOrEqual(0.85);
      expect(sem.meanRecallAtK).toBeGreaterThanOrEqual(0.9);
      expect(sem.meanNDCGAtK).toBeGreaterThanOrEqual(0.95);
      expect(sem.noAnswerAccuracy).toBe(1.0); // 100% suppression on 4 distractor queries

      // Keyword Baseline Assertions:
      expect(kw.meanPrecisionAtK).toBeGreaterThan(0.4);
      // Keyword recall is lower due to synonym / vocabulary mismatch
      expect(kw.meanRecallAtK).toBeLessThan(sem.meanRecallAtK);

      // Comparative Deltas:
      expect(report.metricDeltas.recallDelta).toBeGreaterThanOrEqual(0.05);
      expect(report.metricDeltas.f1Delta).toBeGreaterThanOrEqual(0.05);

      // Hybrid Baseline:
      expect(hyb.meanRecallAtK).toBeGreaterThanOrEqual(0.9);
      expect(hyb.meanNDCGAtK).toBeGreaterThanOrEqual(0.9);
    });

    it('6b. should execute comparative benchmark with Hybrid RRF and verify rank fusion efficacy', () => {
      const rrfReport = runner.runValidationEvaluation({
        k: 5,
        hybridMethod: 'rrf',
        rrfConstant: 60,
      });
      const hybRrf = rrfReport.hybridSummary!;

      expect(hybRrf.systemType).toBe('hybrid');
      expect(hybRrf.meanPrecisionAtK).toBeGreaterThanOrEqual(0.8);
      expect(hybRrf.meanRecallAtK).toBeGreaterThanOrEqual(0.9);
      expect(hybRrf.meanNDCGAtK).toBeGreaterThanOrEqual(0.9);
      expect(hybRrf.noAnswerAccuracy).toBeGreaterThanOrEqual(0.75); // 3 of 4 distractors suppressed; 1 lexical overlap on common words
    });

    it('7. should generalize comparative benchmark to Held-Out Test Split with multilingual queries', () => {
      const report = runner.runTestEvaluation({ k: 5 });

      const sem = report.semanticSummary;
      const kw = report.keywordSummary;

      // Assert that semantic search handles English query for Spanish chunk
      expect(sem.coverageRate).toBe(1.0);
      expect(sem.noAnswerAccuracy).toBe(1.0); // 4 distractors correctly rejected
      expect(kw.noAnswerAccuracy).toBe(1.0);

      // Keyword search fails on English query matching Spanish text
      const englishQuery = HELD_OUT_TEST_SPLIT_QUERIES.find(
        (q) => q.queryId === 'test_q2_acl_acute_en',
      )!;
      const kwEnglishResults = keywordBaseline.search(englishQuery.queryText, 5);
      expect(kwEnglishResults.length).toBe(0); // Fails across languages, proving Semantic superiority

      expect(report.metricDeltas.recallDelta).toBeGreaterThanOrEqual(0.15);
    });
  });

  describe('Part 4 — Query Category Breakdown & Failure Analysis', () => {
    it('8. should provide category-level metrics illustrating where keyword search underperforms', () => {
      const report = runner.runTestEvaluation({ k: 5 });

      const semCategories = report.semanticSummary.categoryBreakdown!;
      const kwCategories = report.keywordSummary.categoryBreakdown!;

      // Multilingual category: Semantic > Keyword
      expect(semCategories['multilingual']?.meanRecallAtK).toBeGreaterThan(0.8);
      expect(kwCategories['multilingual']?.meanRecallAtK).toBe(0.0);

      // Synonym category: Semantic > Keyword
      if (semCategories['synonym'] && kwCategories['synonym']) {
        expect(semCategories['synonym'].meanRecallAtK).toBeGreaterThan(
          kwCategories['synonym'].meanRecallAtK,
        );
      }

      // Exact category: Both perform well
      if (semCategories['exact'] && kwCategories['exact']) {
        expect(semCategories['exact'].meanRecallAtK).toBeGreaterThanOrEqual(0.8);
        expect(kwCategories['exact'].meanRecallAtK).toBeGreaterThanOrEqual(0.7);
      }
    });
  });
});
