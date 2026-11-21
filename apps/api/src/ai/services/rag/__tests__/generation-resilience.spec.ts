import { RAGOrchestratorService } from '../rag-orchestrator.service';
import { GroundedGenerationService } from '../grounded-generation.service';
import { GenerationObservabilityService } from '../generation-observability.service';
import { OllamaLLMAdapter } from '../../../adapters/llm/ollama-llm.adapter';
import {
  ISemanticSearchUseCase,
  IRAGContextBuilderPort,
  IGroundedGenerationPort,
  ILLMProviderPort,
  RetrievalAuthContext,
  RetrievedChunk,
  ChunkId,
  SimilarityScore,
  RetrievalProvenance,
  RAGEvidenceChunk,
  RAGConstructedContext,
  VisibilityScope,
  ProviderTimeoutException,
  GenerationCancelledException,
  LLMProviderUnavailableException,
  ModelNotFoundException,
  EmptyRetrievalQueryException,
} from '@kinergy-platform/core';
import { DEFAULT_AI_CONFIG } from '../../../config/ai.config';

interface OllamaAdapterTestingHooks {
  activeGenerations: number;
  recordFailure(): void;
  recordSuccess(): void;
  assertCircuitClosed(): void;
  circuitBreaker: { lastFailureTime: number };
}

const asHooks = (a: OllamaLLMAdapter) => a as unknown as OllamaAdapterTestingHooks;

describe('AI-08.6 Generation Resilience & Observability Test Suite', () => {
  const authContext: RetrievalAuthContext = {
    tenantId: 'tenant-clinica-alpha',
    userId: 'user-kinesiologo-99',
    roles: ['ROLE_TRAINER'],
    allowedVisibilityScopes: [VisibilityScope.ALL_STAFF, VisibilityScope.CLINICAL_STAFF],
  };

  const createRetrievedChunk = (id: string, content: string, similarity = 0.95): RetrievedChunk => {
    const provenance = RetrievalProvenance.create({
      documentTitle: 'Manual Clínico',
      documentVersionNumber: 1,
      originalFileName: 'manual.pdf',
      mimeType: 'application/pdf',
      chunkSequence: 1,
      pageNumber: 1,
      language: 'es',
    });

    return RetrievedChunk.create({
      id: `uuid-${id}`,
      chunkId: ChunkId.fromString(id),
      documentId: `doc-${id}`,
      documentVersionId: `ver-${id}`,
      indexGenerationId: 'gen-active-1',
      content,
      tokenCount: 20,
      similarity: SimilarityScore.create(similarity),
      distance: 1 - similarity,
      provenance,
    });
  };

  const createMockConstructedContext = (chunks: RetrievedChunk[]): RAGConstructedContext => {
    const evidence = chunks.map((c, i) => RAGEvidenceChunk.fromRetrievedChunk(c, i + 1));
    return RAGConstructedContext.create({
      formattedContext: '<retrieved_evidence>...</retrieved_evidence>',
      includedChunks: evidence,
      excludedChunks: [],
      totalContextTokens: 250,
      evidenceTokens: 100,
      historyTokens: 0,
      systemPromptTokens: 150,
      budgetRemaining: 3000,
      omittedChunkCount: 0,
    });
  };

  describe('Phase 1 & 7: Timeout Policy & Pipeline Deadline', () => {
    it('should abort and throw ProviderTimeoutException when request budget times out', async () => {
      const mockRetrieval: jest.Mocked<ISemanticSearchUseCase> = {
        execute: jest.fn().mockImplementation(
          () => new Promise((resolve) => setTimeout(resolve, 500)), // takes 500ms
        ),
      };
      const mockBuilder: jest.Mocked<IRAGContextBuilderPort> = { buildContext: jest.fn() };
      const mockGen: jest.Mocked<IGroundedGenerationPort> = { generateGroundedAnswer: jest.fn() };
      const observability = new GenerationObservabilityService();

      const service = new RAGOrchestratorService(
        mockRetrieval,
        mockBuilder,
        mockGen,
        undefined,
        undefined,
        observability,
        {
          ...DEFAULT_AI_CONFIG,
          requestTimeoutMs: 50, // very tight deadline (50ms)
        },
      );

      await expect(
        service.execute({
          query: '¿Protocolo de hombro?',
          authContext,
        }),
      ).rejects.toThrow(ProviderTimeoutException);

      const logs = observability.getRecentLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]?.outcome).toBe('TIMEOUT');
      expect(logs[0]?.timeoutStatus).toBe(true);
    });
  });

  describe('Phase 2 & 7: Retry Policy & Transient Failure Classification', () => {
    it('should retry transient provider errors and succeed on second attempt', async () => {
      const mockLLM = {
        getModelIdentifier: () => 'qwen3:4b',
        generateText: jest
          .fn()
          .mockRejectedValueOnce(new ProviderTimeoutException('Transient socket timeout'))
          .mockResolvedValueOnce({
            text: JSON.stringify({
              answer: 'El vendaje alivia dolor articular.',
              grounded: true,
              citedChunkIds: ['chk-1'],
            }),
            promptTokens: 120,
            completionTokens: 35,
            modelIdentifier: 'qwen3:4b',
            finishReason: 'stop',
          }),
        generateStream: jest.fn(),
      };

      const chunk = createRetrievedChunk('chk-1', 'Contenido clínico');
      const context = createMockConstructedContext([chunk]);

      const service = new GroundedGenerationService(mockLLM as unknown as ILLMProviderPort, {
        ...DEFAULT_AI_CONFIG,
        generationMaxRetries: 1,
        generationRetryBaseDelayMs: 10,
        generationRetryMaxDelayMs: 50,
      });

      const result = await service.generateGroundedAnswer({
        query: '¿Vendaje?',
        constructedContext: context,
      });

      expect(mockLLM.generateText).toHaveBeenCalledTimes(2);
      expect(result.grounded).toBe(true);
      expect(result.answer).toContain('El vendaje alivia dolor articular.');
    });

    it('should retry once when model produces malformed JSON and recover', async () => {
      const mockLLM = {
        getModelIdentifier: () => 'qwen3:4b',
        generateText: jest
          .fn()
          .mockResolvedValueOnce({
            text: 'I cannot answer in JSON right now. Plain text error.',
            promptTokens: 100,
            completionTokens: 20,
            modelIdentifier: 'qwen3:4b',
            finishReason: 'stop',
          })
          .mockResolvedValueOnce({
            text: JSON.stringify({
              answer: 'Respuesta recuperada en formato estructurado.',
              grounded: true,
              citedChunkIds: ['chk-1'],
            }),
            promptTokens: 110,
            completionTokens: 25,
            modelIdentifier: 'qwen3:4b',
            finishReason: 'stop',
          }),
        generateStream: jest.fn(),
      };

      const chunk = createRetrievedChunk('chk-1', 'Contenido clínico');
      const context = createMockConstructedContext([chunk]);

      const service = new GroundedGenerationService(mockLLM as unknown as ILLMProviderPort, {
        ...DEFAULT_AI_CONFIG,
        generationMaxRetries: 1,
        generationRetryBaseDelayMs: 10,
      });

      const result = await service.generateGroundedAnswer({
        query: 'Consulta',
        constructedContext: context,
      });

      expect(mockLLM.generateText).toHaveBeenCalledTimes(2);
      expect(result.grounded).toBe(true);
      expect(result.answer).toBe('Respuesta recuperada en formato estructurado.');
    });

    it('should NOT retry permanent failures (e.g. ModelNotFoundException)', async () => {
      const mockLLM = {
        getModelIdentifier: () => 'missing:model',
        generateText: jest.fn().mockRejectedValue(new ModelNotFoundException('missing:model')),
        generateStream: jest.fn(),
      };

      const chunk = createRetrievedChunk('chk-1', 'Contenido clínico');
      const context = createMockConstructedContext([chunk]);

      const service = new GroundedGenerationService(mockLLM as unknown as ILLMProviderPort, {
        ...DEFAULT_AI_CONFIG,
        generationMaxRetries: 2,
      });

      await expect(
        service.generateGroundedAnswer({
          query: 'Consulta',
          constructedContext: context,
        }),
      ).rejects.toThrow(ModelNotFoundException);

      // Must fail-fast on permanent error without retrying
      expect(mockLLM.generateText).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry permanent application validation failures (EmptyRetrievalQueryException)', async () => {
      const mockRetrieval: jest.Mocked<ISemanticSearchUseCase> = { execute: jest.fn() };
      const mockBuilder: jest.Mocked<IRAGContextBuilderPort> = { buildContext: jest.fn() };
      const mockGen: jest.Mocked<IGroundedGenerationPort> = { generateGroundedAnswer: jest.fn() };

      const service = new RAGOrchestratorService(mockRetrieval, mockBuilder, mockGen);

      await expect(
        service.execute({
          query: '   ',
          authContext,
        }),
      ).rejects.toThrow(EmptyRetrievalQueryException);

      expect(mockRetrieval.execute).not.toHaveBeenCalled();
    });
  });

  describe('Phase 3 & 7: Request Cancellation via AbortSignal', () => {
    it('should immediately abort execution when client AbortSignal triggers', async () => {
      const abortController = new AbortController();
      const mockRetrieval: jest.Mocked<ISemanticSearchUseCase> = {
        execute: jest.fn().mockImplementation(() => {
          abortController.abort(); // trigger abort during retrieval
          return new Promise((resolve) => setTimeout(resolve, 100));
        }),
      };
      const mockBuilder: jest.Mocked<IRAGContextBuilderPort> = { buildContext: jest.fn() };
      const mockGen: jest.Mocked<IGroundedGenerationPort> = { generateGroundedAnswer: jest.fn() };
      const observability = new GenerationObservabilityService();

      const service = new RAGOrchestratorService(
        mockRetrieval,
        mockBuilder,
        mockGen,
        undefined,
        undefined,
        observability,
      );

      await expect(
        service.execute({
          query: '¿Consulta cancelada?',
          authContext,
          signal: abortController.signal,
        }),
      ).rejects.toThrow(GenerationCancelledException);

      const logs = observability.getRecentLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]?.outcome).toBe('CANCELLED');
    });
  });

  describe('Phase 4, 5 & 7: Concurrency & Circuit Breaker Protection in OllamaLLMAdapter', () => {
    it('should enforce concurrency ceiling and reject requests exceeding chatMaxConcurrent', async () => {
      const adapter = new OllamaLLMAdapter({
        enabled: true,
        llmProvider: 'ollama',
        chatMaxConcurrent: 1,
        requestTimeoutMs: 1000,
      });

      // Simulate an active ongoing generation
      asHooks(adapter).activeGenerations = 1;

      await expect(adapter.generateText('Test prompt')).rejects.toThrow(
        LLMProviderUnavailableException,
      );
    });

    it('should trip circuit breaker from CLOSED to OPEN after consecutive failures', () => {
      const adapter = new OllamaLLMAdapter({
        enabled: true,
        llmProvider: 'ollama',
        failureThreshold: 3,
      });

      expect(adapter.getCircuitBreakerStatus().state).toBe('CLOSED');

      // Trigger 3 failures
      asHooks(adapter).recordFailure();
      asHooks(adapter).recordFailure();
      expect(adapter.getCircuitBreakerStatus().state).toBe('CLOSED');

      asHooks(adapter).recordFailure();
      expect(adapter.getCircuitBreakerStatus().state).toBe('OPEN');
      expect(adapter.getCircuitBreakerStatus().isOpen).toBe(true);

      // Fast-fails immediately without hitting network
      expect(() => asHooks(adapter).assertCircuitClosed()).toThrow(LLMProviderUnavailableException);
    });

    it('should transition circuit breaker to HALF_OPEN after cooldown period and reset on success', () => {
      const adapter = new OllamaLLMAdapter({
        enabled: true,
        llmProvider: 'ollama',
        failureThreshold: 2,
      });

      asHooks(adapter).recordFailure();
      asHooks(adapter).recordFailure();
      expect(adapter.getCircuitBreakerStatus().state).toBe('OPEN');

      // Age the failure beyond cooldown
      asHooks(adapter).circuitBreaker.lastFailureTime = Date.now() - 20000;
      expect(adapter.getCircuitBreakerStatus().state).toBe('HALF_OPEN');

      // assertCircuitClosed allows trial request and resets
      asHooks(adapter).assertCircuitClosed();
      asHooks(adapter).recordSuccess();

      expect(adapter.getCircuitBreakerStatus().state).toBe('CLOSED');
      expect(adapter.getCircuitBreakerStatus().isOpen).toBe(false);
    });
  });

  describe('Phase 6 & 7: Generation Logging & Sensitive Data Exclusion', () => {
    it('should record structured telemetry without logging raw queries, prompts, or PII', async () => {
      const observability = new GenerationObservabilityService();
      const rawUserQuery = 'Tengo dolor lumbar severo y mi DNI es 12345678X';

      observability.recordGeneration({
        requestId: 'req-obs-1',
        correlationId: 'corr-obs-1',
        tenantId: 'tenant-clinica-alpha',
        userId: 'user-patient-999',
        query: rawUserQuery,
        modelIdentifier: 'qwen3:4b',
        promptVersion: 'kinergy-rag-v1.0.0',
        retrievalCount: 5,
        contextChunkCount: 3,
        inputTokenEstimate: 350,
        outputTokenCount: 60,
        retrievalDurationMs: 45,
        contextDurationMs: 10,
        generationDurationMs: 350,
        validationDurationMs: 5,
        totalDurationMs: 410,
        retryCount: 0,
        outcome: 'SUCCESS',
        citationCount: 2,
        isGrounded: true,
      });

      const logs = observability.getRecentLogs();
      expect(logs).toHaveLength(1);
      const log = logs[0]!;

      // Verify privacy guarantees:
      // 1. Raw query is NOT present; only queryHash and queryLength
      expect((log as unknown as Record<string, unknown>).query).toBeUndefined();
      expect(log.queryHash).toBeDefined();
      expect(log.queryHash).not.toContain('DNI');
      expect(log.queryLength).toBe(rawUserQuery.length);

      // 2. Raw userId is NOT present; only anonymized pseudonym
      expect((log as unknown as Record<string, unknown>).userId).toBeUndefined();
      expect(log.userPseudonym).toBeDefined();
      expect(log.userPseudonym).not.toContain('user-patient-999');

      // 3. Durations and outcomes captured accurately
      expect(log.totalDurationMs).toBe(410);
      expect(log.outcome).toBe('SUCCESS');
      expect(log.citationCount).toBe(2);
      expect(log.isGrounded).toBe(true);
    });

    it('should calculate metrics summary with accurate percentiles and rates', () => {
      const observability = new GenerationObservabilityService();

      for (let i = 1; i <= 10; i++) {
        observability.recordGeneration({
          requestId: `req-${i}`,
          tenantId: 'tenant-1',
          query: `Query ${i}`,
          modelIdentifier: 'qwen3:4b',
          promptVersion: 'v1',
          retrievalCount: 2,
          contextChunkCount: 2,
          inputTokenEstimate: 100,
          outputTokenCount: 50,
          retrievalDurationMs: 10 * i,
          contextDurationMs: 5,
          generationDurationMs: 50 * i,
          validationDurationMs: 5,
          totalDurationMs: 100 * i, // 100ms, 200ms, ..., 1000ms
          retryCount: 0,
          outcome: i <= 8 ? 'SUCCESS' : i === 9 ? 'ABSTAINED' : 'TIMEOUT',
          citationCount: 1,
          isGrounded: i <= 8,
        });
      }

      const summary = observability.getMetricsSummary();
      expect(summary.totalRequests).toBe(10);
      expect(summary.successCount).toBe(8);
      expect(summary.abstainedCount).toBe(1);
      expect(summary.timeoutCount).toBe(1);
      expect(summary.groundedRate).toBe(0.8);
      expect(summary.abstentionRate).toBe(0.1);
      expect(summary.errorRate).toBe(0.1);
      expect(summary.latency.min).toBe(100);
      expect(summary.latency.max).toBe(1000);
      expect(summary.latency.p50).toBe(500);
    });
  });
});
