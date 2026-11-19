import {
  EmbeddingProviderUnavailableException,
  EmbeddingDimensionMismatchException,
  ModelNotFoundException,
  ProviderTimeoutException,
  GenerationCancelledException,
} from '@kinergy-platform/core';
import { OllamaEmbeddingAdapter } from '../ollama-embedding.adapter';

describe('OllamaEmbeddingAdapter Contract & Vector Tests', () => {
  let adapter: OllamaEmbeddingAdapter;
  const originalFetch = global.fetch;

  beforeEach(() => {
    adapter = new OllamaEmbeddingAdapter({
      ollamaBaseUrl: 'http://mock-ollama:11434',
      embeddingModel: 'bge-m3:latest',
      embeddingDimensions: 1024,
      timeoutMs: 1000,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('should return exact 1024 dimensions contract', () => {
    expect(adapter.getDimensions()).toBe(1024);
  });

  it('should return the configured embedding model', () => {
    expect(adapter.getModelIdentifier()).toBe('bge-m3:latest');
  });

  describe('generateEmbedding', () => {
    it('should throw when input text is empty or blank', async () => {
      await expect(adapter.generateEmbedding('   ')).rejects.toThrow(
        EmbeddingProviderUnavailableException,
      );
    });

    it('should return valid 1024 float array on success', async () => {
      const mockVector = new Array(1024).fill(0.123);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: mockVector }),
      } as unknown as Response);

      const result = await adapter.generateEmbedding('Standard text');
      expect(result).toHaveLength(1024);
      expect(result[0]).toBe(0.123);
    });

    it('should throw EmbeddingDimensionMismatchException if dimensions !== 1024', async () => {
      const invalidVector = new Array(768).fill(0.1);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: invalidVector }),
      } as unknown as Response);

      await expect(adapter.generateEmbedding('Standard text')).rejects.toThrow(
        EmbeddingDimensionMismatchException,
      );
    });

    it('should throw EmbeddingProviderUnavailableException when vector contains non-finite numbers', async () => {
      const invalidVector = new Array(1024).fill(0.1);
      invalidVector[50] = NaN;
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: invalidVector }),
      } as unknown as Response);

      await expect(adapter.generateEmbedding('Standard text')).rejects.toThrow(
        /non-finite or non-numeric/,
      );
    });

    it('should throw ModelNotFoundException when Ollama returns HTTP 404', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
      } as unknown as Response);

      await expect(adapter.generateEmbedding('Standard text')).rejects.toThrow(
        ModelNotFoundException,
      );
    });

    it('should throw ProviderTimeoutException when request times out', async () => {
      const abortError = new Error('The operation was aborted');
      abortError.name = 'AbortError';
      global.fetch = jest.fn().mockRejectedValue(abortError);

      await expect(adapter.generateEmbedding('Standard text')).rejects.toThrow(
        ProviderTimeoutException,
      );
    });

    it('should throw GenerationCancelledException when cancelled by caller signal', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        adapter.generateEmbedding('Standard text', { signal: controller.signal }),
      ).rejects.toThrow(GenerationCancelledException);
    });

    it('should throw EmbeddingProviderUnavailableException when Ollama fails with 503', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
      } as unknown as Response);

      await expect(adapter.generateEmbedding('Standard text')).rejects.toThrow(
        EmbeddingProviderUnavailableException,
      );
    });
  });

  describe('generateBatchEmbeddings', () => {
    it('should return empty array when texts array is empty', async () => {
      const results = await adapter.generateBatchEmbeddings([]);
      expect(results).toEqual([]);
    });

    it('should process batches and return array of vector arrays', async () => {
      const mockVector = new Array(1024).fill(0.5);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ embedding: mockVector }),
      } as unknown as Response);

      const batch = ['chunk 1', 'chunk 2', 'chunk 3'];
      const results = await adapter.generateBatchEmbeddings(batch);

      expect(results).toHaveLength(3);
      expect(results[0]).toHaveLength(1024);
      expect(results[1]).toHaveLength(1024);
      expect(results[2]).toHaveLength(1024);
    });
  });

  describe('checkHealth', () => {
    it('should return isHealthy: true when bge-m3 is in Ollama manifest', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [{ name: 'bge-m3:latest', model: 'bge-m3:latest' }],
        }),
      } as unknown as Response);

      const health = await adapter.checkHealth();
      expect(health.isHealthy).toBe(true);
      expect(health.model).toBe('bge-m3:latest');
    });

    it('should return isHealthy: false without throwing when offline', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Connection failed'));

      const health = await adapter.checkHealth();
      expect(health.isHealthy).toBe(false);
    });
  });
});
