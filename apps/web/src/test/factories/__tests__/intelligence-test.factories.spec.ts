import {
  generateTestId,
  resetFactoryCounters,
  createMockCitation,
  createMockGenerationMetadata,
  createMockMessage,
  createMockConversation,
  createMockRAGAnswerResponse,
  createMockDocumentVersion,
  createMockKnowledgeDocument,
  createMockIngestionStage,
  createMockRetrievalStatus,
} from '../intelligence-test.factories';

describe('AI-09.10-IT.02 — Intelligence Test Factories Specification', () => {
  beforeEach(() => {
    resetFactoryCounters();
  });

  describe('1. Deterministic Identifier Generation', () => {
    it('produces sequential deterministic IDs and resets on request', () => {
      const id1 = generateTestId('item');
      const id2 = generateTestId('item');
      expect(id1).toBe('item_0001');
      expect(id2).toBe('item_0002');

      resetFactoryCounters();
      const idReset = generateTestId('item');
      expect(idReset).toBe('item_0001');
    });
  });

  describe('2. RAG Source Citation Factory', () => {
    it('creates a fully populated, valid citation with default clinical fixtures', () => {
      const citation = createMockCitation();

      expect(citation.citationId).toBe('cit_0003');
      expect(citation.documentTitle).toContain('Protocolo Clínico');
      expect(citation.relevanceScore).toBe(0.94);
      expect(citation.sourceStrategy).toBe('HYBRID');
      expect(citation.canPreview).toBe(true);
      expect(citation.previewStatus).toBe('DOCUMENT_AVAILABLE');
    });

    it('respects partial overrides while preserving defaults', () => {
      const citation = createMockCitation({
        documentTitle: 'Guía de Articulaciones 2026',
        relevanceScore: 0.99,
        previewStatus: 'DOCUMENT_RESTRICTED',
        canPreview: false,
      });

      expect(citation.documentTitle).toBe('Guía de Articulaciones 2026');
      expect(citation.relevanceScore).toBe(0.99);
      expect(citation.previewStatus).toBe('DOCUMENT_RESTRICTED');
      expect(citation.canPreview).toBe(false);
      expect(citation.mimeType).toBe('application/pdf');
    });
  });

  describe('3. Chat Message Factory', () => {
    it('creates an assistant message with grounded citation sources and metadata by default', () => {
      const message = createMockMessage();

      expect(message.role).toBe('assistant');
      expect(message.status).toBe('success');
      expect(message.grounded).toBe(true);
      expect(message.sources).toHaveLength(1);
      expect(message.metadata?.model).toBe('qwen3:4b');
    });

    it('creates a clean user message when role is user', () => {
      const userMessage = createMockMessage({ role: 'user', content: '¿Qué es tendinopatía?' });

      expect(userMessage.role).toBe('user');
      expect(userMessage.content).toBe('¿Qué es tendinopatía?');
      expect(userMessage.grounded).toBe(false);
      expect(userMessage.sources).toBeUndefined();
      expect(userMessage.metadata).toBeUndefined();
    });
  });

  describe('4. Conversation & Response Factories', () => {
    it('creates a structured conversation with default user and assistant messages', () => {
      const conv = createMockConversation();

      expect(conv.id).toBe('conv_0001');
      expect(conv.title).toBe('Consulta de Rehabilitación Rotuliana');
      expect(conv.messages).toHaveLength(2);
      expect(conv.messages[0]?.role).toBe('user');
      expect(conv.messages[1]?.role).toBe('assistant');
      expect(conv.tenantId).toBe('tenant_test_default');
      expect(conv.userId).toBe('usr_test_default');
    });

    it('creates generation metadata and RAG answer responses with verified citations', () => {
      const meta = createMockGenerationMetadata({ latencyMs: 350 });
      expect(meta.model).toBe('qwen3:4b');
      expect(meta.latencyMs).toBe(350);

      const answerResponse = createMockRAGAnswerResponse({
        answer: 'Respuesta clínica validada.',
        metadata: meta,
      });
      expect(answerResponse.answer).toBe('Respuesta clínica validada.');
      expect(answerResponse.grounded).toBe(true);
      expect(answerResponse.sources).toHaveLength(1);
      expect(answerResponse.metadata.latencyMs).toBe(350);
    });
  });

  describe('5. Knowledge Center & Document Factories', () => {
    it('creates a valid KnowledgeDocumentItem with default version references', () => {
      const doc = createMockKnowledgeDocument();

      expect(doc.id).toBe('doc_0001');
      expect(doc.title).toContain('Kinesiología Deportiva');
      expect(doc.visibilityScope).toBe('ALL_STAFF');
      expect(doc.ingestionStatus).toBe('READY');
      expect(doc.fileExtension).toBe('pdf');
    });

    it('creates a valid DocumentVersionItem with SHA256 checksum and language', () => {
      const version = createMockDocumentVersion();

      expect(version.versionNumber).toBe(1);
      expect(version.checksum).toHaveLength(64);
      expect(version.language).toBe('es');
      expect(version.ingestionStatus).toBe('READY');
    });

    it('creates an IngestionStageInfo item with stage metrics', () => {
      const stage = createMockIngestionStage();

      expect(stage.stage).toBe('INDEXING');
      expect(stage.status).toBe('COMPLETED');
      expect(stage.metrics?.totalChunks).toBe(48);
      expect(stage.metrics?.embeddedChunks).toBe(48);
    });

    it('creates an IngestionRetrievalStatus object confirming retrieval readiness', () => {
      const retrievalStatus = createMockRetrievalStatus();

      expect(retrievalStatus.isReadyForRetrieval).toBe(true);
      expect(retrievalStatus.overallReady).toBe(true);
      expect(retrievalStatus.embeddingsCommitted).toBe(true);
      expect(retrievalStatus.totalChunks).toBe(48);
    });
  });
});
