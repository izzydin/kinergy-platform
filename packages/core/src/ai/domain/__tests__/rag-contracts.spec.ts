import {
  ChatMessage,
  RAGEvidenceChunk,
  RAGSourceCitation,
  RAGAnswer,
  RAGConstructedContext,
  RetrievedChunk,
  ChunkId,
  SimilarityScore,
  RetrievalProvenance,
} from '../../../../src/ai';

describe('RAG Domain Contracts & Value Objects', () => {
  describe('ChatMessage Value Object', () => {
    it('should create valid user, assistant, and system messages', () => {
      const userMsg = ChatMessage.user('¿Cómo tratar una lumbalgia aguda?');
      const assistantMsg = ChatMessage.assistant(
        'El protocolo inicial incluye reposo relativo y termoterapia.',
      );
      const systemMsg = ChatMessage.system('Eres un asistente clínico.');

      expect(userMsg.role).toBe('user');
      expect(userMsg.content).toBe('¿Cómo tratar una lumbalgia aguda?');

      expect(assistantMsg.role).toBe('assistant');
      expect(assistantMsg.content).toContain('reposo relativo');

      expect(systemMsg.role).toBe('system');
      expect(systemMsg.content).toContain('asistente clínico');
    });

    it('should reject empty or whitespace content', () => {
      expect(() => ChatMessage.create({ role: 'user', content: '' })).toThrow();
      expect(() => ChatMessage.create({ role: 'user', content: '   ' })).toThrow();
    });

    it('should reject invalid roles', () => {
      // @ts-expect-error Testing invalid role
      expect(() => ChatMessage.create({ role: 'invalid', content: 'test' })).toThrow();
    });

    it('should enforce maximum message length invariant', () => {
      const longText = 'a'.repeat(ChatMessage.MAX_MESSAGE_LENGTH + 1);
      expect(() => ChatMessage.user(longText)).toThrow(/exceeds maximum allowable/);
    });
  });

  describe('RAGEvidenceChunk Model', () => {
    it('should create an evidence chunk preserving all fields', () => {
      const chunk = RAGEvidenceChunk.create({
        chunkId: 'chk-100',
        documentId: 'doc-200',
        documentTitle: 'Protocolo Cervical 2026',
        documentVersionNumber: 2,
        content: 'No realizar tracción cervical en presencia de inestabilidad.',
        tokenCount: 42,
        similarityScore: 0.95,
        pageNumber: 12,
        headingPath: ['Evaluación', 'Precauciones'],
        sectionHierarchy: ['Capítulo 3', 'Precauciones'],
        retrievalStrategy: 'HYBRID',
        semanticRank: 1,
        semanticScore: 0.92,
        keywordRank: 2,
        keywordScore: 0.88,
        rrfRank: 1,
        rrfScore: 0.032,
      });

      expect(chunk.chunkId).toBe('chk-100');
      expect(chunk.documentId).toBe('doc-200');
      expect(chunk.documentTitle).toBe('Protocolo Cervical 2026');
      expect(chunk.documentVersionNumber).toBe(2);
      expect(chunk.content).toContain('No realizar tracción');
      expect(chunk.pageNumber).toBe(12);
      expect(chunk.headingPath).toEqual(['Evaluación', 'Precauciones']);
      expect(chunk.sectionHierarchy).toEqual(['Capítulo 3', 'Precauciones']);
      expect(chunk.retrievalStrategy).toBe('HYBRID');
      expect(chunk.semanticRank).toBe(1);
      expect(chunk.keywordRank).toBe(2);
      expect(chunk.rrfRank).toBe(1);
    });

    it('should hydrate with high fidelity from a domain RetrievedChunk', () => {
      const provenance = RetrievalProvenance.create({
        documentTitle: 'Guía Clínica de Hombro',
        documentVersionNumber: 3,
        originalFileName: 'hombro.pdf',
        mimeType: 'application/pdf',
        chunkSequence: 4,
        pageNumber: 7,
        headingPath: ['Manguito Rotador', 'Ejercicios'],
        sectionHierarchy: ['Sección 2', 'Ejercicios'],
        language: 'es',
      });

      const retrieved = RetrievedChunk.create({
        id: 'chunk-uuid-1',
        chunkId: ChunkId.fromString('kc_hombro_004'),
        documentId: 'doc-uuid-99',
        documentVersionId: 'ver-uuid-3',
        indexGenerationId: 'gen-uuid-1',
        content: 'Evitar abducción superior a 90 grados en fase aguda.',
        tokenCount: 35,
        similarity: SimilarityScore.create(0.89),
        distance: 0.11,
        provenance,
        metadata: {
          strategy: 'HYBRID',
          candidateSources: ['semantic', 'keyword'],
          semanticRank: 2,
          semanticScore: 0.85,
          lexicalRank: 1,
          lexicalScore: 0.94,
          rrfRank: 1,
          rrfScore: 0.0315,
        },
      });

      const evidence = RAGEvidenceChunk.fromRetrievedChunk(retrieved, 1, 'HYBRID');

      expect(evidence.chunkId).toBe('kc_hombro_004');
      expect(evidence.documentId).toBe('doc-uuid-99');
      expect(evidence.documentTitle).toBe('Guía Clínica de Hombro');
      expect(evidence.pageNumber).toBe(7);
      expect(evidence.content).toBe('Evitar abducción superior a 90 grados en fase aguda.');
      expect(evidence.similarityScore).toBe(0.89);
      expect(evidence.retrievalStrategy).toBe('HYBRID');
      expect(evidence.semanticRank).toBe(2);
      expect(evidence.keywordRank).toBe(1);
      expect(evidence.rrfRank).toBe(1);
    });
  });

  describe('RAGSourceCitation Value Object', () => {
    it('should create citation from evidence chunk', () => {
      const evidence = RAGEvidenceChunk.create({
        chunkId: 'chk-1',
        documentId: 'doc-1',
        documentTitle: 'Manual Kinésico',
        documentVersionNumber: 1,
        content: 'Texto clínico.',
        tokenCount: 10,
        similarityScore: 0.91,
        pageNumber: 5,
        headingPath: ['Introducción'],
        retrievalStrategy: 'SEMANTIC',
      });

      const citation = RAGSourceCitation.fromEvidenceChunk(evidence);
      expect(citation.chunkId).toBe('chk-1');
      expect(citation.documentId).toBe('doc-1');
      expect(citation.documentTitle).toBe('Manual Kinésico');
      expect(citation.pageNumber).toBe(5);
      expect(citation.relevanceScore).toBe(0.91);
      expect(citation.sourceStrategy).toBe('SEMANTIC');
    });
  });

  describe('RAGAnswer Model', () => {
    it('should create grounded response with verified citations', () => {
      const citation = RAGSourceCitation.create({
        documentId: 'doc-1',
        documentTitle: 'Doc A',
        chunkId: 'chk-1',
        pageNumber: 3,
        relevanceScore: 0.95,
      });

      const answer = RAGAnswer.create({
        answer: 'Respuesta verificada según el protocolo.',
        grounded: true,
        sources: [citation],
        metadata: {
          model: 'qwen3:4b',
          retrievalCount: 3,
          latencyMs: 250,
          finishReason: 'stop',
        },
      });

      expect(answer.answer).toContain('Respuesta verificada');
      expect(answer.grounded).toBe(true);
      expect(answer.sources).toHaveLength(1);
      expect(answer.sources[0]?.chunkId).toBe('chk-1');
      expect(answer.metadata.model).toBe('qwen3:4b');
    });

    it('should create abstention response with grounded: false and empty sources', () => {
      const abstention = RAGAnswer.abstain(
        'No se encontró una política verificada.',
        'qwen3:4b',
        45,
      );

      expect(abstention.answer).toBe('No se encontró una política verificada.');
      expect(abstention.grounded).toBe(false);
      expect(abstention.sources).toHaveLength(0);
      expect(abstention.metadata.finishReason).toBe('insufficient_context');
    });
  });

  describe('RAGConstructedContext Model', () => {
    it('should create empty context', () => {
      const empty = RAGConstructedContext.empty(450, 4096);
      expect(empty.formattedContext).toContain('<retrieved_evidence>');
      expect(empty.includedChunks).toHaveLength(0);
      expect(empty.excludedChunks).toHaveLength(0);
      expect(empty.omittedChunkCount).toBe(0);
      expect(empty.budgetRemaining).toBe(4096 - 450);
    });
  });
});
