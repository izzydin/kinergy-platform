import {
  ReciprocalRankFusion,
  RetrievedChunk,
  ChunkId,
  SimilarityScore,
  RetrievalProvenance,
  InvalidRetrievalQueryException,
} from '../../../index';

describe('AI-07.2 — Reciprocal Rank Fusion (RRF) Domain Unit Tests', () => {
  const createMockChunk = (id: string, score = 0.5): RetrievedChunk => {
    return RetrievedChunk.create({
      id,
      chunkId: ChunkId.fromString(id),
      documentId: `doc_${id}`,
      documentVersionId: `ver_${id}`,
      indexGenerationId: 'gen_test',
      content: `Contenido de prueba para ${id}`,
      tokenCount: 10,
      similarity: SimilarityScore.create(score),
      distance: 1 - score,
      provenance: RetrievalProvenance.create({
        documentTitle: `Documento ${id}`,
        documentVersionNumber: 1,
        originalFileName: `${id}.pdf`,
        mimeType: 'application/pdf',
        chunkSequence: 0,
        language: 'es',
      }),
      metadata: { originalSource: 'test' },
    });
  };

  it('1. should fuse candidates present in both lists and give them higher priority', () => {
    // Chunk A is #1 in semantic and #1 in lexical
    // Chunk B is #2 in semantic only
    // Chunk C is #2 in lexical only
    const chunkA = createMockChunk('chk_a', 0.9);
    const chunkB = createMockChunk('chk_b', 0.85);
    const chunkC = createMockChunk('chk_c', 0.7);

    const semantic = [chunkA, chunkB];
    const lexical = [chunkA, chunkC];

    const fused = ReciprocalRankFusion.fuse(semantic, lexical, { rrfConstant: 60, topK: 5 });

    expect(fused.length).toBe(3);
    // Chunk A must be #1 with highest score because it appeared in both lists
    expect(fused[0]?.id).toBe('chk_a');
    expect(fused[0]?.metadata?.['retrievalSources']).toEqual(['semantic', 'keyword']);
    expect(fused[0]?.metadata?.['semanticRank']).toBe(1);
    expect(fused[0]?.metadata?.['lexicalRank']).toBe(1);
    expect(fused[0]?.similarity.value).toBe(1.0); // max theoretical score is 1.0

    // Chunks B and C each appeared in only one list at rank 2:
    // rrfScore for B = 1 / (60 + 2) = 1/62
    // rrfScore for C = 1 / (60 + 2) = 1/62
    // Fused order between B and C must be deterministic (sorted by chunk.id ASC: chk_b < chk_c)
    expect(fused[1]?.id).toBe('chk_b');
    expect(fused[2]?.id).toBe('chk_c');
    expect(fused[1]?.metadata?.['retrievalSources']).toEqual(['semantic']);
    expect(fused[2]?.metadata?.['retrievalSources']).toEqual(['keyword']);
  });

  it('2. should handle candidates present in only one list', () => {
    const chunkSem1 = createMockChunk('chk_sem_1');
    const chunkSem2 = createMockChunk('chk_sem_2');
    const chunkLex1 = createMockChunk('chk_lex_1');

    const semantic = [chunkSem1, chunkSem2];
    const lexical = [chunkLex1];

    const fused = ReciprocalRankFusion.fuse(semantic, lexical, { rrfConstant: 60, topK: 5 });
    expect(fused.length).toBe(3);

    // Rank 1 in semantic (1/61) and rank 1 in lexical (1/61) have equal score.
    // Tied scores break by chunk.id ASC: 'chk_lex_1' < 'chk_sem_1'
    expect(fused[0]?.id).toBe('chk_lex_1');
    expect(fused[1]?.id).toBe('chk_sem_1');
    expect(fused[2]?.id).toBe('chk_sem_2');
  });

  it('3. should handle duplicate identities within the same list deterministically', () => {
    const chunkA = createMockChunk('chk_dup');
    // Duplicate chunkA in semantic list at rank 1 and rank 2
    const semantic = [chunkA, chunkA];
    const lexical: RetrievedChunk[] = [];

    const fused = ReciprocalRankFusion.fuse(semantic, lexical, { rrfConstant: 60 });
    expect(fused.length).toBe(1);
    expect(fused[0]?.id).toBe('chk_dup');
    expect(fused[0]?.metadata?.['semanticRank']).toBe(1);
  });

  it('4. should handle different list lengths and empty lists', () => {
    const c1 = createMockChunk('chk_1');
    const c2 = createMockChunk('chk_2');
    const c3 = createMockChunk('chk_3');

    // Semantic empty, lexical populated
    const fusedLexOnly = ReciprocalRankFusion.fuse([], [c1, c2, c3], { topK: 2 });
    expect(fusedLexOnly.length).toBe(2);
    expect(fusedLexOnly[0]?.id).toBe('chk_1');
    expect(fusedLexOnly[1]?.id).toBe('chk_2');

    // Both empty
    const fusedEmpty = ReciprocalRankFusion.fuse([], []);
    expect(fusedEmpty).toEqual([]);
  });

  it('5. should enforce deterministic tie-breaking when fused scores are identical', () => {
    // Both chunks appear in only one list at rank 1: same score 1/(60+1)
    const chunkZ = createMockChunk('chk_z');
    const chunkA = createMockChunk('chk_a');

    const fused = ReciprocalRankFusion.fuse([chunkZ], [chunkA]);
    expect(fused.length).toBe(2);
    // Even though chunkZ was passed in first list, chk_a < chk_z tie-breaks first
    expect(fused[0]?.id).toBe('chk_a');
    expect(fused[1]?.id).toBe('chk_z');
  });

  it('6. should respect configurable RRF constant k', () => {
    const chunk1 = createMockChunk('chk_1');
    const chunk2 = createMockChunk('chk_2');

    // k = 20 vs k = 100
    const fusedK20 = ReciprocalRankFusion.fuse([chunk1], [chunk2], { rrfConstant: 20 });
    const fusedK100 = ReciprocalRankFusion.fuse([chunk1], [chunk2], { rrfConstant: 100 });

    expect(fusedK20.length).toBe(2);
    expect(fusedK100.length).toBe(2);
  });

  it('7. should enforce topK truncation strictly', () => {
    const chunks = new Array(15)
      .fill(0)
      .map((_, i) => createMockChunk(`chk_${String(i).padStart(2, '0')}`));
    const fused = ReciprocalRankFusion.fuse(chunks.slice(0, 10), chunks.slice(5, 15), { topK: 3 });
    expect(fused.length).toBe(3);
  });

  it('8. should validate and reject invalid configuration values', () => {
    const c = createMockChunk('chk_1');

    // Negative or zero k
    expect(() => ReciprocalRankFusion.fuse([c], [], { rrfConstant: 0 })).toThrow(
      InvalidRetrievalQueryException,
    );
    expect(() => ReciprocalRankFusion.fuse([c], [], { rrfConstant: -10 })).toThrow(
      InvalidRetrievalQueryException,
    );

    // Invalid topK
    expect(() => ReciprocalRankFusion.fuse([c], [], { topK: 0 })).toThrow(
      InvalidRetrievalQueryException,
    );
    expect(() => ReciprocalRankFusion.fuse([c], [], { topK: 51 })).toThrow(
      InvalidRetrievalQueryException,
    );
  });
});
