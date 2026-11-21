import {
  RetrievalQuery,
  RetrievalCriteria,
  SimilarityScore,
  RetrievalSearchMode,
  LEXICAL_RETRIEVAL_PORT,
  ILexicalRetrievalPort,
  RetrievedChunk,
  RetrievalProvenance,
  ChunkId,
} from '../../../index';

describe('AI-07.1 — Lexical Retrieval Domain Boundaries & Invariants', () => {
  const tenantId = 'tenant_lexical_domain_test';

  it('1. should define LEXICAL_RETRIEVAL_PORT symbol and RetrievalSearchMode.KEYWORD', () => {
    expect(LEXICAL_RETRIEVAL_PORT).toBeDefined();
    expect(typeof LEXICAL_RETRIEVAL_PORT).toBe('symbol');
    expect(RetrievalSearchMode.KEYWORD).toBe('KEYWORD');
  });

  it('2. should instantiate RetrievalQuery for lexical search with default criteria', () => {
    const criteria = RetrievalCriteria.create({ tenantId });
    const query = RetrievalQuery.create({
      query: 'rehabilitación ligamento cruzado',
      criteria,
      topK: 10,
    });

    expect(query.rawQuery).toBe('rehabilitación ligamento cruzado');
    expect(query.normalizedQuery).toBe('rehabilitación ligamento cruzado');
    expect(query.topK).toBe(10);
    expect(query.minSimilarity.value).toBe(0.0);
    expect(query.criteria.tenantId).toBe(tenantId);
  });

  it('3. should allow mock implementation of ILexicalRetrievalPort without external infrastructure', async () => {
    const mockPort: ILexicalRetrievalPort = {
      search: jest.fn().mockImplementation(async (_query: RetrievalQuery) => {
        return [
          RetrievedChunk.create({
            id: 'chk_1',
            chunkId: ChunkId.fromString('chk_1'),
            documentId: 'doc_1',
            documentVersionId: 'ver_1',
            indexGenerationId: 'lexical',
            content: 'Texto de prueba para búsqueda léxica',
            tokenCount: 8,
            similarity: SimilarityScore.create(0.75),
            distance: 0.25,
            provenance: RetrievalProvenance.create({
              documentTitle: 'Guía Clínica',
              documentVersionNumber: 1,
              originalFileName: 'guia.pdf',
              mimeType: 'application/pdf',
              chunkSequence: 0,
              language: 'es',
            }),
          }),
        ];
      }),
      countMatches: jest.fn().mockResolvedValue(1),
    };

    const criteria = RetrievalCriteria.create({ tenantId });
    const query = RetrievalQuery.create({ query: 'clínica', criteria });

    const results = await mockPort.search(query);
    expect(results.length).toBe(1);
    expect(results[0]?.content).toBe('Texto de prueba para búsqueda léxica');
    expect(results[0]?.similarity.value).toBe(0.75);
    expect(results[0]?.indexGenerationId).toBe('lexical');

    const count = await mockPort.countMatches(query);
    expect(count).toBe(1);
  });
});
