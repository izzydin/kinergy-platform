import { LocalCrossEncoderRerankingAdapter } from '../local-cross-encoder-reranking.adapter';
import {
  RetrievedChunk,
  ChunkId,
  SimilarityScore,
  RetrievalProvenance,
} from '@kinergy-platform/core';

describe('AI-07.5 — LocalCrossEncoderRerankingAdapter Unit Tests', () => {
  const createMockChunk = (
    id: string,
    content: string,
    score = 0.5,
    title = 'Documento de Kinesiología',
  ): RetrievedChunk => {
    return RetrievedChunk.create({
      id,
      chunkId: ChunkId.fromString(id),
      documentId: `doc_${id}`,
      documentVersionId: `ver_${id}`,
      indexGenerationId: 'gen_test',
      content,
      tokenCount: 20,
      similarity: SimilarityScore.create(score),
      distance: 1 - score,
      provenance: RetrievalProvenance.create({
        documentTitle: title,
        documentVersionNumber: 1,
        originalFileName: `${id}.pdf`,
        mimeType: 'application/pdf',
        chunkSequence: 0,
        language: 'es',
      }),
      metadata: { originalSource: 'test' },
    });
  };

  it('1. should return empty array when candidates array is empty', async () => {
    const adapter = new LocalCrossEncoderRerankingAdapter(undefined, { provider: 'mock' });

    const result = await adapter.rerank({
      query: 'politica de cancelacion',
      candidates: [],
      topK: 5,
    });

    expect(result).toEqual([]);
  });

  it('2. should preserve original candidates when query is empty or whitespace', async () => {
    const adapter = new LocalCrossEncoderRerankingAdapter(undefined, { provider: 'mock' });
    const c1 = createMockChunk('chk_1', 'Contenido uno', 0.8);
    const c2 = createMockChunk('chk_2', 'Contenido dos', 0.7);

    const result = await adapter.rerank({
      query: '   ',
      candidates: [c1, c2],
      topK: 2,
    });

    expect(result.length).toBe(2);
    expect(result[0]?.chunk.id).toBe('chk_1');
    expect(result[1]?.chunk.id).toBe('chk_2');
  });

  it('3. should strictly bound candidate count to maxCandidates ceiling', async () => {
    const maxCandidates = 5;
    const adapter = new LocalCrossEncoderRerankingAdapter(undefined, {
      provider: 'mock',
      maxCandidates,
    });

    // Provide 10 candidates
    const candidates = Array.from({ length: 10 }, (_, i) =>
      createMockChunk(`chk_${i}`, `Contenido de evaluacion de kinesiologia chunk ${i}`, 0.5),
    );

    const result = await adapter.rerank({
      query: 'kinesiologia evaluacion',
      candidates,
      topK: 10,
    });

    // Even though topK was 10, candidate pool was bounded to maxCandidates = 5
    expect(result.length).toBe(5);
  });

  it('4. should safely truncate long query and long chunk content without failing', async () => {
    const adapter = new LocalCrossEncoderRerankingAdapter(undefined, {
      provider: 'mock',
      maxQueryLength: 50,
      maxChunkLength: 100,
    });

    const veryLongQuery = 'kinesiologia '.repeat(50); // > 500 chars
    const veryLongChunk = createMockChunk(
      'chk_long',
      'Protocolo de rehabilitacion motora y kinesiologia funcional '.repeat(50),
    );

    const result = await adapter.rerank({
      query: veryLongQuery,
      candidates: [veryLongChunk],
      topK: 1,
    });

    expect(result.length).toBe(1);
    expect(result[0]?.chunk.id).toBe('chk_long');
  });

  it('5. should score relevant chunk higher than distractor chunk with simulated cross-attention', async () => {
    const adapter = new LocalCrossEncoderRerankingAdapter(undefined, { provider: 'mock' });

    // Distractor has matching word "cancelacion" but is about gym membership
    const distractor = createMockChunk(
      'chk_distractor',
      'El gimnasio no admite la cancelacion de cuotas anuales una vez abonadas.',
      0.88, // initially had higher RRF score
      'Reglamento de Gimnasio',
    );

    // Highly relevant chunk has exact phrase and clinical semantics
    const relevant = createMockChunk(
      'chk_relevant',
      'Las sesiones de kinesiologia deben ser canceladas con al menos 24 horas de anticipacion para no incurrir en cobro.',
      0.65, // initially had lower RRF score
      'Politica de Citas y Kinesiologia',
    );

    const result = await adapter.rerank({
      query: 'cancelacion de citas de kinesiologia con anticipacion',
      candidates: [distractor, relevant],
      topK: 2,
    });

    expect(result.length).toBe(2);
    // Cross-encoder should promote relevant chunk to #1
    expect(result[0]?.chunk.id).toBe('chk_relevant');
    expect(result[0]?.finalRank).toBe(1);
    expect(result[0]?.originalRank).toBe(2); // was rank 2 originally
    expect(result[0]?.rerankerScore).toBeGreaterThan(result[1]!.rerankerScore);

    expect(result[1]?.chunk.id).toBe('chk_distractor');
    expect(result[1]?.finalRank).toBe(2);
  });

  it('6. should break score ties deterministically by chunk.chunkId.value ASC', async () => {
    const adapter = new LocalCrossEncoderRerankingAdapter(undefined, { provider: 'mock' });

    // Two completely unrelated chunks with zero token matches will receive equal base score
    const chunkZ = createMockChunk('chk_z', 'Texto zeta completamente neutro', 0.5);
    const chunkA = createMockChunk('chk_a', 'Texto alfa completamente neutro', 0.5);

    const result = await adapter.rerank({
      query: 'consulta medica traumatologica',
      candidates: [chunkZ, chunkA],
      topK: 2,
    });

    expect(result.length).toBe(2);
    expect(result[0]?.rerankerScore).toBe(result[1]?.rerankerScore);
    // Tied score resolved deterministically: chk_a < chk_z
    expect(result[0]?.chunk.id).toBe('chk_a');
    expect(result[1]?.chunk.id).toBe('chk_z');
  });

  it('7. should respect abort signal', async () => {
    const adapter = new LocalCrossEncoderRerankingAdapter(undefined, { provider: 'mock' });
    const c1 = createMockChunk('chk_1', 'Contenido');

    const controller = new AbortController();
    controller.abort();

    await expect(
      adapter.rerank({
        query: 'test query',
        candidates: [c1],
        topK: 1,
        signal: controller.signal,
      }),
    ).rejects.toThrow('Reranking operation aborted by caller signal.');
  });
});
