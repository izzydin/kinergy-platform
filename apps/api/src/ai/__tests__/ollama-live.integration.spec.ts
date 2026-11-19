import { OllamaLLMAdapter } from '../adapters/llm/ollama-llm.adapter';
import { OllamaEmbeddingAdapter } from '../adapters/embedding/ollama-embedding.adapter';
import { EmbeddingProviderUnavailableException } from '@kinergy-platform/core';

describe('Ollama Live Hardware & Provider Integration Suite (Task 3 Compliance)', () => {
  let isOllamaRunning = false;
  let llmAdapter: OllamaLLMAdapter;
  let embeddingAdapter: OllamaEmbeddingAdapter;

  beforeAll(async () => {
    llmAdapter = new OllamaLLMAdapter({
      ollamaBaseUrl: 'http://127.0.0.1:11434',
      llmModel: 'qwen3:4b',
      timeoutMs: 30000,
    });

    embeddingAdapter = new OllamaEmbeddingAdapter({
      ollamaBaseUrl: 'http://127.0.0.1:11434',
      embeddingModel: 'bge-m3:latest',
      embeddingDimensions: 1024,
      timeoutMs: 15000,
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

  describe('Live Generative Model (Qwen 3 4B)', () => {
    it('should verify live health check against local Ollama runtime', async () => {
      if (!isOllamaRunning) {
        console.warn('Skipping live Ollama test: daemon offline');
        return;
      }

      const llmHealth = await llmAdapter.checkHealth();
      expect(llmHealth.isHealthy).toBe(true);
      expect(llmHealth.model).toBe('qwen3:4b');
      expect(llmHealth.latencyMs).toBeGreaterThan(0);
    }, 10000);

    it('should generate fluent Spanish completion with clinical domain terminology', async () => {
      if (!isOllamaRunning) return;

      const result = await llmAdapter.generateText(
        '¿Cuál es el beneficio de la fase excéntrica en la rehabilitación de tendinopatías?',
        { temperature: 0.1, maxTokens: 80 },
      );

      expect(result).toBeDefined();
      expect(result.modelIdentifier).toBe('qwen3:4b');
      expect(result.text.length).toBeGreaterThan(20);
      expect(result.promptTokens).toBeGreaterThan(0);
      expect(result.completionTokens).toBeGreaterThan(0);
      expect(result.finishReason).toBeDefined();
    }, 30000);

    it('should generate fluent English completion with biomechanical precision', async () => {
      if (!isOllamaRunning) return;

      const result = await llmAdapter.generateText(
        'Define a concentric muscle contraction in one sentence.',
        { temperature: 0.1, maxTokens: 100 },
      );

      expect(result).toBeDefined();
      expect(result.modelIdentifier).toBe('qwen3:4b');
      expect(result.text.length).toBeGreaterThan(15);
      expect(result.promptTokens).toBeGreaterThan(0);
      expect(result.completionTokens).toBeGreaterThan(0);
    }, 30000);

    it('should generate valid structured JSON output when requested', async () => {
      if (!isOllamaRunning) return;

      const result = await llmAdapter.generateText(
        'Evaluate equipment status: Treadmill 3 motor overheat. Return JSON with schema {"severity": "HIGH", "action": string}',
        { format: 'json', maxTokens: 60 },
      );

      expect(result).toBeDefined();
      expect(() => JSON.parse(result.text)).not.toThrow();
      const parsed = JSON.parse(result.text);
      expect(parsed).toHaveProperty('severity');
    }, 30000);

    it('should honor maximum token boundaries', async () => {
      if (!isOllamaRunning) return;

      const maxLimit = 25;
      const result = await llmAdapter.generateText(
        'Write a long historical essay about sports medicine.',
        {
          maxTokens: maxLimit,
        },
      );

      expect(result.completionTokens).toBeLessThanOrEqual(maxLimit + 5); // small Ollama margin
    }, 30000);
  });

  describe('Live Embedding Model (BAAI/BGE-M3)', () => {
    it('should verify live embedding model availability in Ollama tags', async () => {
      if (!isOllamaRunning) return;

      const embedHealth = await embeddingAdapter.checkHealth();
      expect(embedHealth.isHealthy).toBe(true);
      expect(embedHealth.model).toBe('bge-m3:latest');
    }, 10000);

    it('should generate real 1024-dimensional embedding for Spanish text', async () => {
      if (!isOllamaRunning) return;

      const vector = await embeddingAdapter.generateEmbedding(
        'Evaluación kinesiológica de rango articular de rodilla en flexión pasiva.',
      );

      expect(vector).toBeDefined();
      expect(vector).toHaveLength(1024);
      expect(typeof vector[0]).toBe('number');
      expect(Number.isFinite(vector[0])).toBe(true);
    }, 30000);

    it('should generate real 1024-dimensional embedding for English text', async () => {
      if (!isOllamaRunning) return;

      const vector = await embeddingAdapter.generateEmbedding(
        'Kinesiology clinical assessment of passive knee flexion range of motion.',
      );

      expect(vector).toBeDefined();
      expect(vector).toHaveLength(1024);
      expect(Number.isFinite(vector[0])).toBe(true);
    }, 30000);

    it('should generate batch embeddings for multiple text chunks concurrently', async () => {
      if (!isOllamaRunning) return;

      const batch = [
        'Protocolo de rehabilitación del ligamento cruzado anterior.',
        'Anterior cruciate ligament return-to-sport physical protocol.',
      ];

      const vectors = await embeddingAdapter.generateBatchEmbeddings(batch);
      expect(vectors).toHaveLength(2);
      expect(vectors[0]).toHaveLength(1024);
      expect(vectors[1]).toHaveLength(1024);
    }, 30000);

    it('should reject empty or whitespace-only inputs without making network calls', async () => {
      await expect(embeddingAdapter.generateEmbedding('   ')).rejects.toThrow(
        EmbeddingProviderUnavailableException,
      );
    });
  });
});
