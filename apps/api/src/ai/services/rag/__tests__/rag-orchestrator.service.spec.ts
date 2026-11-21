import { RAGOrchestratorService } from '../rag-orchestrator.service';
import {
  ISemanticSearchUseCase,
  IRAGContextBuilderPort,
  IGroundedGenerationPort,
  RetrievalAuthContext,
  RetrievalResult,
  RetrievalQuery,
  RetrievalCriteria,
  RetrievedChunk,
  ChunkId,
  SimilarityScore,
  RetrievalProvenance,
  RAGEvidenceChunk,
  RAGConstructedContext,
  StructuredGenerationResult,
  RetrievalSearchMode,
  VisibilityScope,
  UnauthorizedRetrievalException,
  EmptyRetrievalQueryException,
  RetrievalDatabaseException,
  ProviderTimeoutException,
} from '@kinergy-platform/core';
import { DEFAULT_AI_CONFIG } from '../../../config/ai.config';

describe('RAGOrchestratorService Application Use Case Tests', () => {
  let service: RAGOrchestratorService;
  let mockRetrievalUseCase: jest.Mocked<ISemanticSearchUseCase>;
  let mockContextBuilder: jest.Mocked<IRAGContextBuilderPort>;
  let mockGroundedGenerator: jest.Mocked<IGroundedGenerationPort>;

  const authContext: RetrievalAuthContext = {
    tenantId: 'tenant-clinica-1',
    userId: 'user-kinesiologo-42',
    roles: ['ROLE_TRAINER'],
    allowedVisibilityScopes: [VisibilityScope.ALL_STAFF, VisibilityScope.CLINICAL_STAFF],
  };

  const createRetrievedChunk = (
    id: string,
    content: string,
    similarity = 0.92,
    page = 1,
    title = 'Manual de Vendaje',
  ): RetrievedChunk => {
    const provenance = RetrievalProvenance.create({
      documentTitle: title,
      documentVersionNumber: 1,
      originalFileName: 'manual.pdf',
      mimeType: 'application/pdf',
      chunkSequence: 1,
      pageNumber: page,
      language: 'es',
    });

    return RetrievedChunk.create({
      id: `chunk-uuid-${id}`,
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
    const evidenceChunks = chunks.map((c, i) => RAGEvidenceChunk.fromRetrievedChunk(c, i + 1));
    return RAGConstructedContext.create({
      formattedContext: '<retrieved_evidence>...</retrieved_evidence>',
      includedChunks: evidenceChunks,
      excludedChunks: [],
      totalContextTokens: 350,
      evidenceTokens: 100,
      historyTokens: 0,
      systemPromptTokens: 450,
      budgetRemaining: 3000,
      omittedChunkCount: 0,
    });
  };

  const dummyQuery = RetrievalQuery.create({
    query: 'test query',
    criteria: RetrievalCriteria.create({ tenantId: 'tenant-clinic-1' }),
  });

  beforeEach(() => {
    mockRetrievalUseCase = {
      execute: jest.fn(),
    };

    mockContextBuilder = {
      buildContext: jest.fn(),
    };

    mockGroundedGenerator = {
      generateGroundedAnswer: jest.fn(),
    };

    service = new RAGOrchestratorService(
      mockRetrievalUseCase,
      mockContextBuilder,
      mockGroundedGenerator,
      undefined,
      undefined,
      undefined,
      {
        ...DEFAULT_AI_CONFIG,
        retrievalSimilarityThreshold: 0.6,
        retrievalDefaultTopK: 5,
        retrievalSearchMode: 'HYBRID',
      },
    );
  });

  describe('Phase 6 Application Scenarios', () => {
    it('1. Complete Successful Flow: executes retrieval, context building, generation, and verifies source attribution', async () => {
      const chunk1 = createRetrievedChunk(
        'chk-1',
        'Texto clínico sobre vendaje neuromuscular.',
        0.94,
        5,
      );
      const chunk2 = createRetrievedChunk('chk-2', 'Texto complementario.', 0.88, 6);

      const retrievalResult = RetrievalResult.create({
        query: dummyQuery,
        chunks: [chunk1, chunk2],
        totalMatches: 2,
        activeGenerationId: 'gen-1',
        executionDurationMs: 25,
      });

      mockRetrievalUseCase.execute.mockResolvedValueOnce(retrievalResult);

      const constructedContext = createMockConstructedContext([chunk1, chunk2]);
      mockContextBuilder.buildContext.mockResolvedValueOnce(constructedContext);

      const generationResult = StructuredGenerationResult.create({
        rawText:
          '{"answer":"El vendaje neuromuscular...","grounded":true,"citedChunkIds":["chk-1"]}',
        answer: 'El vendaje neuromuscular alivia el dolor y mejora la circulación.',
        grounded: true,
        citedChunkIds: ['chk-1'],
        confidence: 'high',
        modelIdentifier: 'qwen3:4b',
        promptTokens: 150,
        completionTokens: 40,
        promptVersion: 'kinergy-rag-v1.0.0',
        finishReason: 'stop',
      });

      mockGroundedGenerator.generateGroundedAnswer.mockResolvedValueOnce(generationResult);

      const result = await service.execute({
        query: '¿Cuáles son los beneficios del vendaje neuromuscular?',
        authContext,
        searchMode: RetrievalSearchMode.HYBRID,
      });

      expect(result.grounded).toBe(true);
      expect(result.answer).toContain('El vendaje neuromuscular');
      expect(result.sources).toHaveLength(1);
      expect(result.sources[0]?.chunkId).toBe('chk-1');
      expect(result.sources[0]?.documentTitle).toBe('Manual de Vendaje');
      expect(result.sources[0]?.pageNumber).toBe(5);
      expect(result.sources[0]?.relevanceScore).toBe(0.94);
      expect(result.metadata.model).toBe('qwen3:4b');
      expect(result.metadata.retrievalCount).toBe(2);
      expect(result.metadata.latencyMs).toBeGreaterThanOrEqual(0);

      // Verify dependency invocation order
      expect(mockRetrievalUseCase.execute).toHaveBeenCalledTimes(1);
      expect(mockContextBuilder.buildContext).toHaveBeenCalledTimes(1);
      expect(mockGroundedGenerator.generateGroundedAnswer).toHaveBeenCalledTimes(1);
    });

    it('2. No Evidence Short-Circuit: abstains immediately without invoking LLM when retrieval yields 0 chunks', async () => {
      const emptyRetrieval = RetrievalResult.empty(dummyQuery, 'gen-1', 10);
      mockRetrievalUseCase.execute.mockResolvedValueOnce(emptyRetrieval);

      const result = await service.execute({
        query: '¿Cuál es la política de reembolsos?',
        authContext,
      });

      expect(result.grounded).toBe(false);
      expect(result.sources).toHaveLength(0);
      expect(result.answer).toContain('No se encontró documentación o política verificada');
      expect(result.metadata.finishReason).toBe('insufficient_context');

      // Crucial: LLM generator MUST NOT be invoked!
      expect(mockContextBuilder.buildContext).not.toHaveBeenCalled();
      expect(mockGroundedGenerator.generateGroundedAnswer).not.toHaveBeenCalled();
    });

    it('3. Low Similarity Short-Circuit: abstains without LLM invocation when top similarity is below threshold (0.60)', async () => {
      // Chunk with similarity 0.45 (< 0.60 calibrated threshold)
      const lowConfidenceChunk = createRetrievedChunk(
        'chk-low',
        'Texto no relacionado con la pregunta.',
        0.45,
      );
      const lowRetrieval = RetrievalResult.create({
        query: dummyQuery,
        chunks: [lowConfidenceChunk],
        totalMatches: 1,
        activeGenerationId: 'gen-1',
        executionDurationMs: 15,
      });

      mockRetrievalUseCase.execute.mockResolvedValueOnce(lowRetrieval);

      const result = await service.execute({
        query: '¿Cuánto cuesta el plan premium de natación?',
        authContext,
      });

      expect(result.grounded).toBe(false);
      expect(result.sources).toHaveLength(0);
      expect(result.answer).toContain(
        'La información disponible no cuenta con suficiente relevancia',
      );
      expect(result.metadata.finishReason).toBe('insufficient_context');

      // LLM generator MUST NOT be invoked!
      expect(mockContextBuilder.buildContext).not.toHaveBeenCalled();
      expect(mockGroundedGenerator.generateGroundedAnswer).not.toHaveBeenCalled();
    });

    it('4. Empty Chunk Content Short-Circuit: abstains without LLM call when chunks have purely whitespace content', async () => {
      const whitespaceChunk = {
        id: 'chunk-ws',
        chunkId: ChunkId.fromString('chk-ws'),
        content: '     \n\t  ',
        similarity: SimilarityScore.create(0.95),
      } as unknown as RetrievedChunk;
      const wsRetrieval = RetrievalResult.create({
        query: dummyQuery,
        chunks: [whitespaceChunk],
        totalMatches: 1,
        activeGenerationId: 'gen-1',
        executionDurationMs: 12,
      });

      mockRetrievalUseCase.execute.mockResolvedValueOnce(wsRetrieval);

      const result = await service.execute({
        query: 'pregunta',
        authContext,
      });

      expect(result.grounded).toBe(false);
      expect(result.sources).toHaveLength(0);
      expect(result.answer).toContain('No se encontró documentación con contenido verificable');

      expect(mockGroundedGenerator.generateGroundedAnswer).not.toHaveBeenCalled();
    });

    it('5. Context Builder Empty Short-Circuit: abstains if context builder rejects all chunks due to budget overflow', async () => {
      const validChunk = createRetrievedChunk('chk-huge', 'Texto largo.', 0.9);
      mockRetrievalUseCase.execute.mockResolvedValueOnce(
        RetrievalResult.create({
          query: dummyQuery,
          chunks: [validChunk],
          totalMatches: 1,
          activeGenerationId: 'gen-1',
          executionDurationMs: 10,
        }),
      );

      // Context builder excludes all chunks (e.g. oversized)
      mockContextBuilder.buildContext.mockResolvedValueOnce(RAGConstructedContext.empty(450, 4096));

      const result = await service.execute({
        query: 'pregunta',
        authContext,
      });

      expect(result.grounded).toBe(false);
      expect(result.answer).toContain('El contexto de evidencia no pudo ser procesado');
      expect(mockGroundedGenerator.generateGroundedAnswer).not.toHaveBeenCalled();
    });

    it('6. Authorization Failure: throws UnauthorizedRetrievalException if authContext is missing or tenantId is empty', async () => {
      await expect(
        service.execute({
          query: 'test',
          authContext: null as unknown as RetrievalAuthContext,
        }),
      ).rejects.toThrow(UnauthorizedRetrievalException);

      await expect(
        service.execute({
          query: 'test',
          authContext: { ...authContext, tenantId: '   ' },
        }),
      ).rejects.toThrow(UnauthorizedRetrievalException);

      expect(mockRetrievalUseCase.execute).not.toHaveBeenCalled();
    });

    it('7. Query Validation Failure: throws EmptyRetrievalQueryException if query is empty or whitespace', async () => {
      await expect(
        service.execute({
          query: '',
          authContext,
        }),
      ).rejects.toThrow(EmptyRetrievalQueryException);

      await expect(
        service.execute({
          query: '   \n\t  ',
          authContext,
        }),
      ).rejects.toThrow(EmptyRetrievalQueryException);

      expect(mockRetrievalUseCase.execute).not.toHaveBeenCalled();
    });

    it('8. Retrieval Failure Propagation: propagates RetrievalDatabaseException from persistence layer', async () => {
      mockRetrievalUseCase.execute.mockRejectedValueOnce(
        new RetrievalDatabaseException('Database connection failed'),
      );

      await expect(
        service.execute({
          query: 'test',
          authContext,
        }),
      ).rejects.toThrow(RetrievalDatabaseException);
    });

    it('9. LLM Provider Failure Propagation: propagates ProviderTimeoutException without masking', async () => {
      const chunk = createRetrievedChunk('chk-1', 'Contenido.', 0.95);
      mockRetrievalUseCase.execute.mockResolvedValueOnce(
        RetrievalResult.create({
          query: dummyQuery,
          chunks: [chunk],
          totalMatches: 1,
          activeGenerationId: 'gen-1',
          executionDurationMs: 10,
        }),
      );

      mockContextBuilder.buildContext.mockResolvedValueOnce(createMockConstructedContext([chunk]));

      mockGroundedGenerator.generateGroundedAnswer.mockRejectedValueOnce(
        new ProviderTimeoutException('Ollama generation timed out after 30000ms'),
      );

      await expect(
        service.execute({
          query: 'test',
          authContext,
        }),
      ).rejects.toThrow(ProviderTimeoutException);
    });

    it('10. Ungrounded Output Fallback: handles ungrounded generation cleanly with empty sources', async () => {
      const chunk = createRetrievedChunk('chk-1', 'Contenido clínico.', 0.95);
      mockRetrievalUseCase.execute.mockResolvedValueOnce(
        RetrievalResult.create({
          query: dummyQuery,
          chunks: [chunk],
          totalMatches: 1,
          activeGenerationId: 'gen-1',
          executionDurationMs: 10,
        }),
      );

      mockContextBuilder.buildContext.mockResolvedValueOnce(createMockConstructedContext([chunk]));

      // Model indicates evidence does not answer the question
      mockGroundedGenerator.generateGroundedAnswer.mockResolvedValueOnce(
        StructuredGenerationResult.create({
          rawText: '...',
          answer: 'La documentación disponible no menciona este detalle.',
          grounded: false,
          citedChunkIds: [],
          abstentionReason: 'INSUFFICIENT_EVIDENCE',
          confidence: 'low',
          modelIdentifier: 'qwen3:4b',
          promptTokens: 100,
          completionTokens: 25,
          promptVersion: 'kinergy-rag-v1.0.0',
          finishReason: 'stop',
        }),
      );

      const result = await service.execute({
        query: 'pregunta no cubierta',
        authContext,
      });

      expect(result.grounded).toBe(false);
      expect(result.sources).toHaveLength(0);
      expect(result.answer).toContain('no menciona este detalle');
      expect(result.metadata.finishReason).toBe('INSUFFICIENT_EVIDENCE');
    });

    it('11. Tenant Isolation Enforcement: passes tenant context cleanly to retrieval layer', async () => {
      mockRetrievalUseCase.execute.mockResolvedValueOnce(
        RetrievalResult.empty(dummyQuery, 'gen-1', 5),
      );

      await service.execute({
        query: 'test query',
        authContext: {
          tenantId: 'tenant-secure-xyz',
          userId: 'user-7',
          roles: ['ROLE_STAFF'],
          allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
        },
      });

      expect(mockRetrievalUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          authContext: expect.objectContaining({
            tenantId: 'tenant-secure-xyz',
            userId: 'user-7',
          }),
        }),
      );
    });
  });
});
