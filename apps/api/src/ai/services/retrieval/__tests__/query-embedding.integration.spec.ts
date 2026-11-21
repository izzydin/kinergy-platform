import { QueryEmbeddingService } from '../query-embedding.service';
import { OllamaEmbeddingAdapter } from '../../../adapters/embedding/ollama-embedding.adapter';
import { SimilarityScore } from '@kinergy-platform/core';
import { DEFAULT_AI_CONFIG } from '../../../config/ai.config';

describe('QueryEmbeddingService (Live BGE-M3 Hardware Integration Suite)', () => {
  let isOllamaRunning = false;
  let embeddingAdapter: OllamaEmbeddingAdapter;
  let service: QueryEmbeddingService;

  beforeAll(async () => {
    embeddingAdapter = new OllamaEmbeddingAdapter({
      ollamaBaseUrl: 'http://127.0.0.1:11434',
      embeddingModel: 'bge-m3:latest',
      embeddingDimensions: 1024,
      timeoutMs: 15000,
    });

    service = new QueryEmbeddingService(embeddingAdapter, {
      ...DEFAULT_AI_CONFIG,
      embeddingModel: 'bge-m3:latest',
      embeddingDimensions: 1024,
      requestTimeoutMs: 15000,
    });

    try {
      const res = await fetch('http://127.0.0.1:11434/api/tags', {
        signal: AbortSignal.timeout(3000),
      });
      isOllamaRunning = res.ok;
    } catch {
      isOllamaRunning = false;
    }
  });

  it('should generate real 1024-dimensional query embedding via local BGE-M3 runtime', async () => {
    if (!isOllamaRunning) {
      console.warn('Skipping live Ollama query embedding test: daemon offline');
      return;
    }

    const result = await service.generateQueryEmbedding({
      query: 'ejercicios de propiocepción y estabilidad de tobillo',
    });

    expect(result).toBeDefined();
    expect(result.dimensions).toBe(1024);
    expect(result.vector.dimensions).toBe(1024);
    expect(result.vector.isUnitNormalized()).toBe(true);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.normalizedQuery).toBe('ejercicios de propiocepción y estabilidad de tobillo');
  }, 30000);

  it('should verify mathematical compatibility between query embedding and document embedding', async () => {
    if (!isOllamaRunning) return;

    // 1. Generate query embedding for a clinical query
    const queryResult = await service.generateQueryEmbedding({
      query: 'rehabilitación de ligamento cruzado anterior',
    });
    const queryVector = queryResult.vector.values;

    // 2. Generate document embedding for semantically related clinical chunk
    const relatedDocVector = await embeddingAdapter.generateEmbedding(
      'Protocolo de fisioterapia post-quirúrgica de reconstrucción de ligamento cruzado anterior (LCA).',
    );

    // 3. Generate document embedding for an unrelated domain chunk
    const unrelatedDocVector = await embeddingAdapter.generateEmbedding(
      'Técnicas avanzadas de panadería artesanal y fermentación lenta con masa madre.',
    );

    // Calculate Cosine Distance: 1 - dot_product(u, v) (since both are unit L2 normalized)
    function computeCosineDistance(u: readonly number[], v: readonly number[]): number {
      let dot = 0;
      for (let i = 0; i < u.length; i++) {
        dot += (u[i] ?? 0) * (v[i] ?? 0);
      }
      return 1.0 - dot;
    }

    const distRelated = computeCosineDistance(queryVector, relatedDocVector);
    const distUnrelated = computeCosineDistance(queryVector, unrelatedDocVector);

    const scoreRelated = SimilarityScore.fromCosineDistance(distRelated);
    const scoreUnrelated = SimilarityScore.fromCosineDistance(distUnrelated);

    // Mathematical assertions:
    // - Semantically related document must have significantly higher similarity than unrelated text
    // - Similarity must be in [0.0, 1.0]
    expect(scoreRelated.value).toBeGreaterThan(0.65);
    expect(scoreUnrelated.value).toBeLessThan(0.45);
    expect(scoreRelated.value).toBeGreaterThan(scoreUnrelated.value + 0.25);
    expect(distRelated).toBeLessThan(distUnrelated);
  }, 30000);
});
