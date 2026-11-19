import { MockLLMAdapter } from '../mock-llm.adapter';
import { MockEmbeddingAdapter } from '../mock-embedding.adapter';

describe('Mock AI Provider Adapters (CI/Offline Support)', () => {
  describe('MockLLMAdapter', () => {
    let mockLlm: MockLLMAdapter;

    beforeEach(() => {
      mockLlm = new MockLLMAdapter();
    });

    it('should generate text without external dependencies', async () => {
      const result = await mockLlm.generateText('What is kinesiology?');
      expect(result.text).toContain('Mock response');
      expect(result.modelIdentifier).toBe('mock-llm-model');
      expect(result.finishReason).toBe('stop');
    });

    it('should stream mock tokens', async () => {
      const tokens: string[] = [];
      for await (const token of mockLlm.generateStream('Prompt')) {
        tokens.push(token);
      }
      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens.join('')).toBe('This is a mock streamed response.');
    });

    it('should return isHealthy: true on checkHealth', async () => {
      const health = await mockLlm.checkHealth();
      expect(health.isHealthy).toBe(true);
      expect(health.latencyMs).toBeGreaterThan(0);
    });
  });

  describe('MockEmbeddingAdapter', () => {
    let mockEmbedding: MockEmbeddingAdapter;

    beforeEach(() => {
      mockEmbedding = new MockEmbeddingAdapter();
    });

    it('should enforce 1024 dimensions', () => {
      expect(mockEmbedding.getDimensions()).toBe(1024);
    });

    it('should generate deterministic 1024-dim normalized vector', async () => {
      const vector = await mockEmbedding.generateEmbedding('Sample document chunk');
      expect(vector).toHaveLength(1024);

      // Check L2 norm is approximately 1 (normalized)
      const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
      expect(norm).toBeCloseTo(1, 4);
    });

    it('should generate batch embeddings for multiple inputs', async () => {
      const batch = await mockEmbedding.generateBatchEmbeddings(['chunk 1', 'chunk 2']);
      expect(batch).toHaveLength(2);
      expect(batch[0]).toHaveLength(1024);
      expect(batch[1]).toHaveLength(1024);
    });
  });
});
