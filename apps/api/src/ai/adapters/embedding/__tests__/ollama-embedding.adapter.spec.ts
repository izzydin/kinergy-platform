import {
  EmbeddingProviderUnavailableException,
  EmbeddingDimensionMismatchException,
  ModelNotFoundException,
  ProviderTimeoutException,
  GenerationCancelledException,
  InputTooLargeException,
  ResourceExhaustedException,
  InvalidEmbeddingRequestException,
  EmbeddingProfile,
  NormalizationPolicy,
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

    it('should throw InputTooLargeException when text exceeds MAX_INPUT_CHARS', async () => {
      const hugeText = 'a'.repeat(33000);
      await expect(adapter.generateEmbedding(hugeText)).rejects.toThrow(InputTooLargeException);
    });

    it('should throw InvalidEmbeddingRequestException when text contains null characters', async () => {
      await expect(adapter.generateEmbedding('Hello \u0000 World')).rejects.toThrow(
        InvalidEmbeddingRequestException,
      );
    });

    it('should return valid 1024 float array on success via native /api/embed', async () => {
      const mockVector = new Array(1024).fill(0.123);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ model: 'bge-m3:latest', embeddings: [mockVector] }),
      } as unknown as Response);

      const result = await adapter.generateEmbedding('Standard text');
      expect(result).toHaveLength(1024);
      expect(result[0]).toBe(0.123);
    });

    it('should fall back to legacy /api/embeddings when /api/embed returns 404', async () => {
      const mockVector = new Array(1024).fill(0.456);
      global.fetch = jest
        .fn()
        // First call to /api/embed returns 404
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
        } as unknown as Response)
        // Fallback call to /api/embeddings succeeds
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ embedding: mockVector }),
        } as unknown as Response);

      const result = await adapter.generateEmbedding('Standard text');
      expect(result).toHaveLength(1024);
      expect(result[0]).toBe(0.456);
    });

    it('should throw EmbeddingDimensionMismatchException if dimensions !== 1024', async () => {
      const invalidVector = new Array(768).fill(0.1);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ model: 'bge-m3:latest', embeddings: [invalidVector] }),
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
        json: async () => ({ model: 'bge-m3:latest', embeddings: [invalidVector] }),
      } as unknown as Response);

      await expect(adapter.generateEmbedding('Standard text')).rejects.toThrow(
        /non-finite or non-numeric/,
      );
    });

    it('should throw ResourceExhaustedException when Ollama returns HTTP 429 or 507', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 429,
      } as unknown as Response);

      await expect(adapter.generateEmbedding('Standard text')).rejects.toThrow(
        ResourceExhaustedException,
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

    it('should throw InvalidEmbeddingRequestException when batch exceeds 500 items', async () => {
      const largeBatch = new Array(501).fill('valid chunk');
      await expect(adapter.generateBatchEmbeddings(largeBatch)).rejects.toThrow(
        InvalidEmbeddingRequestException,
      );
    });

    it('should process native batch slices and return array of vector arrays', async () => {
      const mockVector = new Array(1024).fill(0.5);
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          model: 'bge-m3:latest',
          embeddings: [mockVector, mockVector, mockVector],
        }),
      } as unknown as Response);

      const batch = ['chunk 1', 'chunk 2', 'chunk 3'];
      const results = await adapter.generateBatchEmbeddings(batch);

      expect(results).toHaveLength(3);
      expect(results[0]).toHaveLength(1024);
      expect(results[1]).toHaveLength(1024);
      expect(results[2]).toHaveLength(1024);
    });
  });

  describe('Model Metadata & Digest Resolution', () => {
    const mockTagsResponse = {
      models: [
        {
          name: 'bge-m3:latest',
          model: 'bge-m3:latest',
          digest: 'sha256:7907646426070047a77226ac3e684fbbe8410524f7b4a74d02837e43f2146bab',
          details: {
            embedding_length: 1024,
            context_length: 8192,
            quantization_level: 'F16',
          },
        },
      ],
    };

    it('should resolve immutable model digest', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockTagsResponse,
      } as unknown as Response);

      const digest = await adapter.getModelDigest();
      expect(digest).toBe(
        'sha256:7907646426070047a77226ac3e684fbbe8410524f7b4a74d02837e43f2146bab',
      );
    });

    it('should resolve full ModelMetadata', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockTagsResponse,
      } as unknown as Response);

      const meta = await adapter.getModelMetadata();
      expect(meta.provider).toBe('ollama');
      expect(meta.modelName).toBe('bge-m3');
      expect(meta.modelVersion).toBe('latest');
      expect(meta.dimensions).toBe(1024);
      expect(meta.contextLength).toBe(8192);
      expect(meta.modelDigest).toBe(
        'sha256:7907646426070047a77226ac3e684fbbe8410524f7b4a74d02837e43f2146bab',
      );
    });

    it('should resolve an immutable EmbeddingProfile from runtime metadata', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => mockTagsResponse,
      } as unknown as Response);

      const profile = await adapter.resolveProfile();
      expect(profile).toBeInstanceOf(EmbeddingProfile);
      expect(profile.provider).toBe('ollama');
      expect(profile.modelName).toBe('bge-m3');
      expect(profile.dimensions).toBe(1024);
      expect(profile.normalizationPolicy).toBe(NormalizationPolicy.UNIT_L2);
      expect(profile.modelDigest).toBe(
        'sha256:7907646426070047a77226ac3e684fbbe8410524f7b4a74d02837e43f2146bab',
      );
      expect(profile.profileId).toContain('prof_bge-m3_1024_');
    });

    it('should throw ModelNotFoundException when target model is not present in tags', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      } as unknown as Response);

      await expect(adapter.getModelDigest()).rejects.toThrow(ModelNotFoundException);
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
