import {
  chatMessageDtoSchema,
  queryKnowledgeRequestSchema,
  ragSourceCitationSchema,
  ragMetadataSchema,
  ragAnswerResponseSchema,
  validateQueryKnowledgeRequest,
  parseRAGAnswerResponse,
} from '../schemas/assistant.schemas';

describe('AI Assistant Runtime Schemas', () => {
  describe('chatMessageDtoSchema', () => {
    it('accepts valid system, user, and assistant turns', () => {
      expect(chatMessageDtoSchema.parse({ role: 'user', content: 'Hello' })).toEqual({
        role: 'user',
        content: 'Hello',
      });
      expect(chatMessageDtoSchema.parse({ role: 'assistant', content: 'World' })).toEqual({
        role: 'assistant',
        content: 'World',
      });
      expect(chatMessageDtoSchema.parse({ role: 'system', content: 'Context' })).toEqual({
        role: 'system',
        content: 'Context',
      });
    });

    it('rejects invalid roles', () => {
      expect(() => chatMessageDtoSchema.parse({ role: 'admin', content: 'Hello' })).toThrow();
    });

    it('rejects empty content', () => {
      expect(() => chatMessageDtoSchema.parse({ role: 'user', content: '' })).toThrow();
    });
  });

  describe('queryKnowledgeRequestSchema', () => {
    it('accepts minimal valid query', () => {
      const result = validateQueryKnowledgeRequest({ query: 'What is kinesiology?' });
      expect(result.query).toBe('What is kinesiology?');
    });

    it('trims leading and trailing whitespace', () => {
      const result = validateQueryKnowledgeRequest({ query: '   Valid query text   ' });
      expect(result.query).toBe('Valid query text');
    });

    it('rejects queries shorter than 3 characters', () => {
      expect(() => validateQueryKnowledgeRequest({ query: 'Hi' })).toThrow();
    });

    it('accepts valid searchMode and topK', () => {
      const result = validateQueryKnowledgeRequest({
        query: 'Protocol questions',
        searchMode: 'HYBRID',
        topK: 10,
      });
      expect(result.searchMode).toBe('HYBRID');
      expect(result.topK).toBe(10);
      expect(queryKnowledgeRequestSchema.safeParse(result).success).toBe(true);
    });

    it('rejects topK out of bounds (1-20)', () => {
      expect(() => validateQueryKnowledgeRequest({ query: 'Valid query', topK: 0 })).toThrow();
      expect(() => validateQueryKnowledgeRequest({ query: 'Valid query', topK: 25 })).toThrow();
    });

    it('accepts valid conversationHistory turns', () => {
      const result = validateQueryKnowledgeRequest({
        query: 'Follow up question',
        conversationHistory: [
          { role: 'user', content: 'First question' },
          { role: 'assistant', content: 'First answer' },
        ],
      });
      expect(result.conversationHistory?.length).toBe(2);
    });
  });

  describe('ragSourceCitationSchema', () => {
    it('accepts valid citation payload', () => {
      const citation = {
        documentId: 'doc-123',
        documentTitle: 'Kinesiology Manual',
        chunkId: 'chunk-456',
        pageNumber: 12,
        headingPath: ['Chapter 1', 'Section 2'],
        relevanceScore: 0.89,
        sourceStrategy: 'HYBRID',
      };
      expect(ragSourceCitationSchema.parse(citation)).toEqual(citation);
    });

    it('rejects relevanceScore outside [0, 1]', () => {
      expect(() =>
        ragSourceCitationSchema.parse({
          documentId: 'doc-123',
          documentTitle: 'Title',
          chunkId: 'chunk-1',
          relevanceScore: 1.5,
        }),
      ).toThrow();
      expect(() =>
        ragSourceCitationSchema.parse({
          documentId: 'doc-123',
          documentTitle: 'Title',
          chunkId: 'chunk-1',
          relevanceScore: -0.1,
        }),
      ).toThrow();
    });
  });

  describe('ragMetadataSchema', () => {
    it('accepts valid metadata payload', () => {
      const meta = {
        model: 'mistral:latest',
        retrievalCount: 5,
        latencyMs: 340,
        finishReason: 'stop',
      };
      expect(ragMetadataSchema.parse(meta)).toEqual(meta);
    });
  });

  describe('ragAnswerResponseSchema', () => {
    it('accepts and parses complete RAG answer envelope', () => {
      const payload = {
        answer: 'This is the verified medical response.',
        grounded: true,
        sources: [
          {
            documentId: 'doc-1',
            documentTitle: 'Manual',
            chunkId: 'chk-1',
            relevanceScore: 0.95,
          },
        ],
        metadata: {
          model: 'mistral:latest',
          retrievalCount: 5,
          latencyMs: 340,
          finishReason: 'stop',
        },
      };

      const result = parseRAGAnswerResponse(payload);
      expect(result.answer).toBe(payload.answer);
      expect(result.grounded).toBe(true);
      expect(result.sources.length).toBe(1);
      expect(result.metadata.latencyMs).toBe(340);
      expect(ragAnswerResponseSchema.safeParse(result).success).toBe(true);
    });

    it('rejects payloads missing metadata or sources', () => {
      expect(() =>
        parseRAGAnswerResponse({
          answer: 'Partial answer',
          grounded: true,
        }),
      ).toThrow();
    });
  });
});
