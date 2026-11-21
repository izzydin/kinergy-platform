import { Test, TestingModule } from '@nestjs/testing';
import { QueryEmbeddingService } from '../query-embedding.service';
import { AI_EMBEDDING_PROVIDER_TOKEN, AI_CONFIG_TOKEN } from '../../../ai.tokens';
import {
  IEmbeddingProviderPort,
  EmbeddingProfile,
  NormalizationPolicy,
  PoolingStrategy,
  EmbeddingType,
  EmptyRetrievalQueryException,
  InvalidRetrievalQueryException,
  EmbeddingDimensionMismatchException,
  RetrievalProfileMismatchException,
  ProviderTimeoutException,
  GenerationCancelledException,
  ModelNotFoundException,
  InputTooLargeException,
  EmbeddingValidationException,
} from '@kinergy-platform/core';
import { AiConfiguration, DEFAULT_AI_CONFIG } from '../../../config/ai.config';

describe('QueryEmbeddingService (Unit Tests)', () => {
  let service: QueryEmbeddingService;
  let mockEmbeddingProvider: jest.Mocked<IEmbeddingProviderPort>;
  let config: AiConfiguration;

  const validVector1024 = new Array(1024).fill(0).map((_, i) => Math.sin(i) / 32);

  const validProfile = EmbeddingProfile.create({
    provider: 'ollama',
    modelName: 'bge-m3',
    modelVersion: 'latest',
    modelDigest: '7907646426070047a77226ac3e684fbbe8410524f7b4a74d02837e43f2146bab',
    dimensions: 1024,
    tokenizerIdentity: 'xlm-roberta',
    normalizationPolicy: NormalizationPolicy.UNIT_L2,
    poolingStrategy: PoolingStrategy.CLS,
    embeddingType: EmbeddingType.DENSE,
  });

  beforeEach(async () => {
    config = {
      ...DEFAULT_AI_CONFIG,
      embeddingModel: 'bge-m3:latest',
      embeddingDimensions: 1024,
      requestTimeoutMs: 5000,
    };

    mockEmbeddingProvider = {
      generateEmbedding: jest.fn().mockResolvedValue(validVector1024),
      generateBatchEmbeddings: jest.fn(),
      getDimensions: jest.fn().mockReturnValue(1024),
      getModelIdentifier: jest.fn().mockReturnValue('bge-m3:latest'),
      getModelDigest: jest
        .fn()
        .mockResolvedValue('7907646426070047a77226ac3e684fbbe8410524f7b4a74d02837e43f2146bab'),
      resolveProfile: jest.fn().mockResolvedValue(validProfile),
      checkHealth: jest.fn().mockResolvedValue({ isHealthy: true, model: 'bge-m3', latencyMs: 10 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueryEmbeddingService,
        { provide: AI_EMBEDDING_PROVIDER_TOKEN, useValue: mockEmbeddingProvider },
        { provide: AI_CONFIG_TOKEN, useValue: config },
      ],
    }).compile();

    service = module.get<QueryEmbeddingService>(QueryEmbeddingService);
  });

  describe('1. Valid Query & Preprocessing', () => {
    it('should generate a valid 1024-dimensional query embedding with measured duration', async () => {
      const result = await service.generateQueryEmbedding({
        query: 'protocolo de rehabilitación de rodilla',
        expectedProfile: validProfile,
      });

      expect(result).toBeDefined();
      expect(result.dimensions).toBe(1024);
      expect(result.vector.dimensions).toBe(1024);
      expect(result.modelIdentifier).toBe('bge-m3:latest');
      expect(result.profileId).toBe(validProfile.profileId);
      expect(result.normalizedQuery).toBe('protocolo de rehabilitación de rodilla');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(mockEmbeddingProvider.generateEmbedding).toHaveBeenCalledTimes(1);
    });

    it('should apply Unicode NFKC normalization matching document chunk normalizer', async () => {
      const result = await service.generateQueryEmbedding({
        query: 'rehabilitaci\u006F\u0301n \uFB01n', // decomposed ó and ligature ﬁ
      });

      expect(result.normalizedQuery).toBe('rehabilitación fin');
      expect(mockEmbeddingProvider.generateEmbedding).toHaveBeenCalledWith(
        'rehabilitación fin',
        expect.anything(),
      );
    });
  });

  describe('2. Input Validation (Empty & Oversized Queries)', () => {
    it('should reject empty or undefined query', async () => {
      await expect(service.generateQueryEmbedding({ query: '' })).rejects.toThrow(
        EmptyRetrievalQueryException,
      );

      await expect(
        service.generateQueryEmbedding({ query: null as unknown as string }),
      ).rejects.toThrow(EmptyRetrievalQueryException);
    });

    it('should reject whitespace-only query', async () => {
      await expect(service.generateQueryEmbedding({ query: '   \n\t   ' })).rejects.toThrow(
        EmptyRetrievalQueryException,
      );
    });

    it('should reject queries exceeding 1,000 characters', async () => {
      const oversized = 'a'.repeat(1001);
      await expect(service.generateQueryEmbedding({ query: oversized })).rejects.toThrow(
        InvalidRetrievalQueryException,
      );
    });
  });

  describe('3. Model Identity & Profile Compatibility', () => {
    it('should reject incompatible model names without silently switching', async () => {
      const incompatibleProfile = EmbeddingProfile.create({
        provider: 'ollama',
        modelName: 'text-embedding-ada-002', // Incompatible model
        modelVersion: 'v2',
        modelDigest: 'other-digest',
        dimensions: 1024,
        tokenizerIdentity: 'cl100k_base',
        normalizationPolicy: NormalizationPolicy.UNIT_L2,
        poolingStrategy: PoolingStrategy.CLS,
        embeddingType: EmbeddingType.DENSE,
      });

      await expect(
        service.generateQueryEmbedding({
          query: 'test query',
          expectedProfile: incompatibleProfile,
        }),
      ).rejects.toThrow(RetrievalProfileMismatchException);
      expect(mockEmbeddingProvider.generateEmbedding).not.toHaveBeenCalled();
    });

    it('should reject dimension mismatch between expectedProfile and provider', async () => {
      const dimMismatchProfile = EmbeddingProfile.create({
        provider: 'ollama',
        modelName: 'bge-m3',
        modelVersion: 'latest',
        modelDigest: 'digest',
        dimensions: 768, // Incompatible dimension
        tokenizerIdentity: 'xlm-roberta',
        normalizationPolicy: NormalizationPolicy.UNIT_L2,
        poolingStrategy: PoolingStrategy.CLS,
        embeddingType: EmbeddingType.DENSE,
      });

      await expect(
        service.generateQueryEmbedding({
          query: 'test query',
          expectedProfile: dimMismatchProfile,
        }),
      ).rejects.toThrow(EmbeddingDimensionMismatchException);
    });
  });

  describe('4. Output Vector Validation (Dimensions, NaN, Infinity)', () => {
    it('should reject empty vector returned by provider', async () => {
      mockEmbeddingProvider.generateEmbedding.mockResolvedValueOnce([]);

      await expect(service.generateQueryEmbedding({ query: 'test' })).rejects.toThrow(
        EmbeddingValidationException,
      );
    });

    it('should reject vector with incorrect dimension count', async () => {
      mockEmbeddingProvider.generateEmbedding.mockResolvedValueOnce(new Array(512).fill(0.1));

      await expect(service.generateQueryEmbedding({ query: 'test' })).rejects.toThrow(
        EmbeddingDimensionMismatchException,
      );
    });

    it('should reject vector containing NaN values', async () => {
      const badVector = new Array(1024).fill(0.1);
      badVector[42] = NaN;
      mockEmbeddingProvider.generateEmbedding.mockResolvedValueOnce(badVector);

      await expect(service.generateQueryEmbedding({ query: 'test' })).rejects.toThrow(
        EmbeddingValidationException,
      );
    });

    it('should reject vector containing Infinity values', async () => {
      const badVector = new Array(1024).fill(0.1);
      badVector[10] = Infinity;
      mockEmbeddingProvider.generateEmbedding.mockResolvedValueOnce(badVector);

      await expect(service.generateQueryEmbedding({ query: 'test' })).rejects.toThrow(
        EmbeddingValidationException,
      );
    });
  });

  describe('5. Retry Behavior & Error Handling', () => {
    it('should retry transient errors and succeed if subsequent attempt passes', async () => {
      mockEmbeddingProvider.generateEmbedding
        .mockRejectedValueOnce(new Error('Connection reset by peer'))
        .mockResolvedValueOnce(validVector1024);

      const result = await service.generateQueryEmbedding({
        query: 'rehabilitation test',
        maxRetries: 2,
      });

      expect(result).toBeDefined();
      expect(mockEmbeddingProvider.generateEmbedding).toHaveBeenCalledTimes(2);
    });

    it('should propagate error if all retry attempts are exhausted', async () => {
      mockEmbeddingProvider.generateEmbedding.mockRejectedValue(
        new Error('Persistent provider failure'),
      );

      await expect(
        service.generateQueryEmbedding({
          query: 'rehabilitation test',
          maxRetries: 1,
        }),
      ).rejects.toThrow('Persistent provider failure');

      expect(mockEmbeddingProvider.generateEmbedding).toHaveBeenCalledTimes(2);
    });

    it('should fast-fail without retry on fatal errors like ModelNotFoundException', async () => {
      mockEmbeddingProvider.generateEmbedding.mockRejectedValue(
        new ModelNotFoundException('bge-m3:latest'),
      );

      await expect(
        service.generateQueryEmbedding({
          query: 'rehabilitation test',
          maxRetries: 3,
        }),
      ).rejects.toThrow(ModelNotFoundException);

      expect(mockEmbeddingProvider.generateEmbedding).toHaveBeenCalledTimes(1);
    });

    it('should fast-fail without retry on InputTooLargeException', async () => {
      mockEmbeddingProvider.generateEmbedding.mockRejectedValue(
        new InputTooLargeException('Input payload exceeds maximum model context limit.'),
      );

      await expect(
        service.generateQueryEmbedding({
          query: 'rehabilitation test',
          maxRetries: 3,
        }),
      ).rejects.toThrow(InputTooLargeException);

      expect(mockEmbeddingProvider.generateEmbedding).toHaveBeenCalledTimes(1);
    });

    it('should abort cleanly if caller signal is already cancelled', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        service.generateQueryEmbedding({
          query: 'rehabilitation test',
          signal: controller.signal,
        }),
      ).rejects.toThrow(GenerationCancelledException);

      expect(mockEmbeddingProvider.generateEmbedding).not.toHaveBeenCalled();
    });

    it('should handle timeout when provider takes too long', async () => {
      mockEmbeddingProvider.generateEmbedding.mockRejectedValue(
        new ProviderTimeoutException('AI provider request timed out after 500ms.'),
      );

      await expect(
        service.generateQueryEmbedding({
          query: 'rehabilitation test',
          timeoutMs: 500,
          maxRetries: 0,
        }),
      ).rejects.toThrow(ProviderTimeoutException);
    });
  });
});
