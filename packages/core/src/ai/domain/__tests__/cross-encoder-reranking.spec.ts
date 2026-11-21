import {
  RerankedChunk,
  RetrievedChunk,
  ChunkId,
  SimilarityScore,
  RetrievalProvenance,
} from '../../../index';

describe('AI-07.5 — RerankedChunk Domain Model Unit Tests', () => {
  const createMockChunk = (id: string, score = 0.85): RetrievedChunk => {
    return RetrievedChunk.create({
      id,
      chunkId: ChunkId.fromString(id),
      documentId: `doc_${id}`,
      documentVersionId: `ver_${id}`,
      indexGenerationId: 'gen_test',
      content: `Contenido de prueba para el chunk ${id}`,
      tokenCount: 15,
      similarity: SimilarityScore.create(score),
      distance: 1 - score,
      provenance: RetrievalProvenance.create({
        documentTitle: `Documento de prueba ${id}`,
        documentVersionNumber: 1,
        originalFileName: `${id}.pdf`,
        mimeType: 'application/pdf',
        chunkSequence: 0,
        language: 'es',
      }),
      metadata: { originalSource: 'test', rrfScore: 0.032 },
    });
  };

  it('1. should create a valid RerankedChunk preserving all candidate properties', () => {
    const chunk = createMockChunk('chk_01', 0.88);
    const reranked = RerankedChunk.create({
      chunk,
      rerankerScore: 0.95,
      originalRank: 3,
      finalRank: 1,
    });

    expect(reranked.chunk.id).toBe('chk_01');
    expect(reranked.rerankerScore).toBe(0.95);
    expect(reranked.originalRank).toBe(3);
    expect(reranked.finalRank).toBe(1);
  });

  it('2. should reject invalid scores or ranks', () => {
    const chunk = createMockChunk('chk_02');

    expect(() =>
      RerankedChunk.create({
        chunk,
        rerankerScore: NaN,
        originalRank: 1,
        finalRank: 1,
      }),
    ).toThrow('Reranker score must be a finite number');

    expect(() =>
      RerankedChunk.create({
        chunk,
        rerankerScore: 0.5,
        originalRank: 0,
        finalRank: 1,
      }),
    ).toThrow('Original rank must be >= 1');

    expect(() =>
      RerankedChunk.create({
        chunk,
        rerankerScore: 0.5,
        originalRank: 1,
        finalRank: 0,
      }),
    ).toThrow('Final rank must be >= 1');
  });

  it('3. should convert to RetrievedChunk while preserving original metrics in metadata without destructive overwrite', () => {
    const originalSimilarity = 0.82;
    const chunk = createMockChunk('chk_03', originalSimilarity);

    const reranked = RerankedChunk.create({
      chunk,
      rerankerScore: 0.965,
      originalRank: 4,
      finalRank: 1,
    });

    const retrieved = reranked.toRetrievedChunk();

    // Verify candidate identity and core properties are untouched
    expect(retrieved.id).toBe('chk_03');
    expect(retrieved.chunkId.value).toBe('chk_03');
    expect(retrieved.documentId).toBe('doc_chk_03');
    expect(retrieved.content).toBe('Contenido de prueba para el chunk chk_03');

    // Verify updated similarity reflects reranker score
    expect(retrieved.similarity.value).toBe(0.965);
    expect(retrieved.distance).toBeCloseTo(1 - 0.965, 5);

    // Verify original metrics are preserved in metadata
    expect(retrieved.metadata?.['rawRerankerScore']).toBe(0.965);
    expect(retrieved.metadata?.['finalRerankedRank']).toBe(1);
    expect(retrieved.metadata?.['originalRrfRank']).toBe(4);
    expect(retrieved.metadata?.['originalSimilarity']).toBe(0.82);
    expect(retrieved.metadata?.['retrievalStrategy']).toBe('HYBRID_RERANKED');
    expect(retrieved.metadata?.['originalSource']).toBe('test');
  });
});
