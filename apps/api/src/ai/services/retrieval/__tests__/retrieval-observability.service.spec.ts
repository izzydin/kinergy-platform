import {
  RetrievalObservabilityService,
  RecordRetrievalLogProps,
} from '../retrieval-observability.service';

describe('RetrievalObservabilityService', () => {
  let service: RetrievalObservabilityService;

  beforeEach(() => {
    service = new RetrievalObservabilityService();
  });

  describe('Structured Logging & Redaction', () => {
    it('should generate structured log entry without raw query or sensitive data', () => {
      const rawSensitiveQuery = 'Patient John Doe diagnosed with lumbar disc herniation';
      const props: RecordRetrievalLogProps = {
        requestId: 'req_001',
        correlationId: 'corr_001',
        tenantId: 'tenant_kinesiology_1',
        userId: 'usr_therapist_42',
        query: rawSensitiveQuery,
        embeddingModel: 'bge-m3-dense-v1',
        requestedTopK: 5,
        returnedCount: 2,
        totalMatchesFound: 8,
        filterCategories: ['documentIds', 'visibilityScope'],
        outcome: 'SUCCESS',
        totalDurationMs: 45.2,
        embeddingDurationMs: 22.1,
        vectorSearchDurationMs: 18.4,
        scoringDurationMs: 1.2,
        provenanceDurationMs: 3.5,
        topSimilarityScore: 0.8845,
      };

      const log = service.logRetrieval(props);

      expect(log.event).toBe('ai_semantic_retrieval');
      expect(log.requestId).toBe('req_001');
      expect(log.correlationId).toBe('corr_001');
      expect(log.tenantId).toBe('tenant_kinesiology_1');
      expect(log.outcome).toBe('SUCCESS');

      // CRITICAL SECURITY ASSERTIONS: Zero sensitive data leakage
      expect(JSON.stringify(log)).not.toContain(rawSensitiveQuery);
      expect(JSON.stringify(log)).not.toContain('John Doe');
      expect(JSON.stringify(log)).not.toContain('lumbar disc herniation');

      // Traceability assertions
      expect(log.queryHash).toBeDefined();
      expect(log.queryHash).toHaveLength(16);
      expect(log.queryLength).toBe(rawSensitiveQuery.length);
      expect(log.userPseudonym).toContain('usr_');
      expect(log.userPseudonym).not.toBe('usr_therapist_42'); // Pseudonymized
      expect(log.topSimilarityScore).toBe(0.8845);
    });

    it('should pseudonymize anonymous users gracefully', () => {
      const props: RecordRetrievalLogProps = {
        requestId: 'req_anon',
        tenantId: 'tenant_1',
        query: 'general query',
        embeddingModel: 'bge-m3',
        requestedTopK: 5,
        returnedCount: 0,
        totalMatchesFound: 0,
        filterCategories: [],
        outcome: 'NO_RELEVANT_CHUNKS',
        totalDurationMs: 10,
        embeddingDurationMs: 5,
        vectorSearchDurationMs: 4,
        scoringDurationMs: 0.5,
        provenanceDurationMs: 0.5,
      };

      const log = service.logRetrieval(props);
      expect(log.userPseudonym).toBe('anon');
      expect(log.correlationId).toBe('req_anon');
    });
  });

  describe('Performance Instrumentation & Percentile Tracking', () => {
    it('should accurately calculate rolling p50, p95, p99 percentiles across multiple requests', () => {
      // Simulate 100 requests with increasing latencies: 1ms, 2ms, ..., 100ms
      for (let i = 1; i <= 100; i++) {
        service.logRetrieval({
          requestId: `req_${i}`,
          tenantId: 'tenant_1',
          query: `query_${i}`,
          embeddingModel: 'bge-m3',
          requestedTopK: 5,
          returnedCount: 3,
          totalMatchesFound: 5,
          filterCategories: [],
          outcome: 'SUCCESS',
          totalDurationMs: i,
          embeddingDurationMs: i * 0.5,
          vectorSearchDurationMs: i * 0.4,
          scoringDurationMs: i * 0.05,
          provenanceDurationMs: i * 0.05,
        });
      }

      const summary = service.getMetricsSummary();

      expect(summary.totalRequests).toBe(100);
      expect(summary.successCount).toBe(100);
      expect(summary.totalErrors).toBe(0);
      expect(summary.errorRate).toBe(0);
      expect(summary.emptyResultRate).toBe(0);

      // Latency Percentile Assertions
      expect(summary.latency.total.min).toBe(1);
      expect(summary.latency.total.max).toBe(100);
      expect(summary.latency.total.p50).toBe(51); // 50th percentile of 1..100
      expect(summary.latency.total.p95).toBe(96); // 95th percentile
      expect(summary.latency.total.p99).toBe(100); // 99th percentile
    });

    it('should calculate error rate, provider timeout rate, and database failure rate', () => {
      // 6 Success, 2 Timeout, 1 DB error, 1 Empty
      for (let i = 0; i < 6; i++) {
        service.logRetrieval({
          requestId: `s_${i}`,
          tenantId: 'tenant_1',
          query: 'test',
          embeddingModel: 'bge-m3',
          requestedTopK: 5,
          returnedCount: 1,
          totalMatchesFound: 1,
          filterCategories: [],
          outcome: 'SUCCESS',
          totalDurationMs: 20,
          embeddingDurationMs: 10,
          vectorSearchDurationMs: 8,
          scoringDurationMs: 1,
          provenanceDurationMs: 1,
        });
      }

      service.logRetrieval({
        requestId: 't_1',
        tenantId: 'tenant_1',
        query: 'test',
        embeddingModel: 'bge-m3',
        requestedTopK: 5,
        returnedCount: 0,
        totalMatchesFound: 0,
        filterCategories: [],
        outcome: 'PROVIDER_TIMEOUT',
        totalDurationMs: 5000,
        embeddingDurationMs: 5000,
        vectorSearchDurationMs: 0,
        scoringDurationMs: 0,
        provenanceDurationMs: 0,
      });

      service.logRetrieval({
        requestId: 't_2',
        tenantId: 'tenant_1',
        query: 'test',
        embeddingModel: 'bge-m3',
        requestedTopK: 5,
        returnedCount: 0,
        totalMatchesFound: 0,
        filterCategories: [],
        outcome: 'PROVIDER_TIMEOUT',
        totalDurationMs: 5000,
        embeddingDurationMs: 5000,
        vectorSearchDurationMs: 0,
        scoringDurationMs: 0,
        provenanceDurationMs: 0,
      });

      service.logRetrieval({
        requestId: 'db_1',
        tenantId: 'tenant_1',
        query: 'test',
        embeddingModel: 'bge-m3',
        requestedTopK: 5,
        returnedCount: 0,
        totalMatchesFound: 0,
        filterCategories: [],
        outcome: 'DATABASE_ERROR',
        totalDurationMs: 50,
        embeddingDurationMs: 20,
        vectorSearchDurationMs: 30,
        scoringDurationMs: 0,
        provenanceDurationMs: 0,
      });

      service.logRetrieval({
        requestId: 'emp_1',
        tenantId: 'tenant_1',
        query: 'test',
        embeddingModel: 'bge-m3',
        requestedTopK: 5,
        returnedCount: 0,
        totalMatchesFound: 0,
        filterCategories: [],
        outcome: 'NO_RELEVANT_CHUNKS',
        totalDurationMs: 30,
        embeddingDurationMs: 15,
        vectorSearchDurationMs: 14,
        scoringDurationMs: 0.5,
        provenanceDurationMs: 0.5,
      });

      const summary = service.getMetricsSummary();

      expect(summary.totalRequests).toBe(10);
      expect(summary.successCount).toBe(6);
      expect(summary.providerTimeoutCount).toBe(2);
      expect(summary.databaseFailureCount).toBe(1);
      expect(summary.emptyResultCount).toBe(1);

      expect(summary.totalErrors).toBe(3); // 2 timeouts + 1 db error
      expect(summary.errorRate).toBe(0.3); // 3 / 10
      expect(summary.providerTimeoutRate).toBe(0.2); // 2 / 10
      expect(summary.databaseFailureRate).toBe(0.1); // 1 / 10
      expect(summary.emptyResultRate).toBe(0.1); // 1 / 10
    });
  });

  describe('Error Sanitization & Categorization', () => {
    it('should distinguish provider timeout errors and provide safe client message', () => {
      const err = new Error('Request timed out after 5000ms');
      const sanitized = service.sanitizeError(err);

      expect(sanitized.outcome).toBe('PROVIDER_TIMEOUT');
      expect(sanitized.errorCode).toBe('PROVIDER_TIMEOUT');
      expect(sanitized.safeMessage).toBe(
        'The AI embedding service timed out. Please retry shortly.',
      );
    });

    it('should distinguish provider inference errors and hide internal host details', () => {
      const err = new Error(
        'Ollama connection refused at http://192.168.1.100:11434/api/embeddings',
      );
      const sanitized = service.sanitizeError(err);

      expect(sanitized.outcome).toBe('PROVIDER_ERROR');
      expect(sanitized.errorCode).toBe('PROVIDER_FAILURE');
      expect(sanitized.safeMessage).toBe(
        'The AI embedding provider encountered an error generating the search query.',
      );
      expect(sanitized.safeMessage).not.toContain('192.168.1.100');
      expect(sanitized.safeMessage).not.toContain('11434');
    });

    it('should distinguish database errors and scrub raw SQL', () => {
      const err = new Error(
        'PrismaClientKnownRequestError: SELECT * FROM document_embeddings WHERE embedding <=> $1 syntax error',
      );
      const sanitized = service.sanitizeError(err);

      expect(sanitized.outcome).toBe('DATABASE_ERROR');
      expect(sanitized.errorCode).toBe('RETRIEVAL_PERSISTENCE_ERROR');
      expect(sanitized.safeMessage).toBe(
        'A persistence error occurred during retrieval. Please retry later.',
      );
      expect(sanitized.safeMessage).not.toContain('SELECT');
      expect(sanitized.safeMessage).not.toContain('PrismaClient');
    });
  });

  describe('Tracing Spans', () => {
    it('should record trace spans with low-cardinality attributes', () => {
      service.recordSpan({
        name: 'query_embedding',
        durationMs: 25.4,
        status: 'OK',
        attributes: { model: 'bge-m3-dense-v1', dimensions: 1024 },
      });

      service.recordSpan({
        name: 'vector_search',
        durationMs: 14.2,
        status: 'OK',
        attributes: { matches: 5 },
      });

      // Verification that recording runs smoothly without exception
      expect(service).toBeDefined();
    });
  });
});
