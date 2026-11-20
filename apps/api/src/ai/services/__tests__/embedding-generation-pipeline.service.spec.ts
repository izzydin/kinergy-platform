import { EmbeddingGenerationPipelineService } from '../embedding-generation-pipeline.service';
import {
  IEmbeddingProviderPort,
  DocumentChunk,
  ChunkProvenance,
  EmbeddingProfile,
  DocumentEmbedding,
  VectorIndexingErrorCode,
  EmbeddingValidationException,
  GenerationCancelledException,
  ProviderTimeoutException,
} from '@kinergy-platform/core';
import { AiConfiguration, DEFAULT_AI_CONFIG } from '../../config/ai.config';

describe('EmbeddingGenerationPipelineService', () => {
  let pipelineService: EmbeddingGenerationPipelineService;
  let mockProvider: jest.Mocked<IEmbeddingProviderPort>;
  let config: AiConfiguration;
  let profile: EmbeddingProfile;

  const tenantId = 'tenant-clinic-101';
  const documentId = 'doc-clinical-001';
  const versionId = 'ver-clinical-001-v1';
  const generationId = 'idx-gen-20261120-001';
  const sampleVector1024 = new Array(1024).fill(0.03125); // 1024 * 0.03125^2 = 1.0 (unit vector)
  const validSha256 = 'a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e';

  function createChunk(
    sequence: number,
    content = `Chunk content for section ${sequence}`,
    overrides: Partial<Parameters<typeof DocumentChunk.create>[0]> = {},
  ): DocumentChunk {
    const provenance = ChunkProvenance.create({
      documentId,
      documentVersionId: versionId,
      chunkIndex: sequence,
      pageNumber: 1,
      sectionHierarchy: ['Protocolo', `Sección ${sequence}`],
      sourceBlockIds: [`block-${sequence}`],
      language: 'es',
      checksum: validSha256,
      configurationVersion: 'v1-target450',
    });

    return DocumentChunk.create({
      id: `chunk-${sequence}`,
      documentId,
      documentVersionId: versionId,
      sequence,
      content,
      tokenCount: 40 + sequence,
      language: 'es',
      provenance,
      ...overrides,
    });
  }

  beforeEach(() => {
    profile = EmbeddingProfile.bgeM3DenseDefault();
    config = {
      ...DEFAULT_AI_CONFIG,
      embeddingBatchSize: 16,
      timeoutMs: 30000,
    };

    mockProvider = {
      generateEmbedding: jest.fn().mockResolvedValue([...sampleVector1024]),
      generateBatchEmbeddings: jest.fn().mockImplementation(async (texts: string[]) => {
        return texts.map(() => [...sampleVector1024]);
      }),
      getDimensions: jest.fn().mockReturnValue(1024),
      getModelIdentifier: jest.fn().mockReturnValue('ollama:bge-m3'),
      resolveProfile: jest.fn().mockResolvedValue(profile),
    };

    pipelineService = new EmbeddingGenerationPipelineService(mockProvider, config);
  });

  describe('Happy Paths & Batch Processing', () => {
    it('generates embedding for a single chunk', async () => {
      const chunk = createChunk(0, 'Único fragmento clínico.');
      const result = await pipelineService.generateEmbeddings({
        tenantId,
        documentId,
        documentVersionId: versionId,
        generationId,
        profile,
        chunks: [chunk],
      });

      expect(result.totalChunksRequested).toBe(1);
      expect(result.successfulEmbeddings.length).toBe(1);
      expect(result.failedChunks.length).toBe(0);
      expect(result.batchCount).toBe(1);
      expect(result.retryCount).toBe(0);
      expect(result.totalTokensProcessed).toBe(chunk.tokenCount);

      const embedding = result.successfulEmbeddings[0]!;
      expect(embedding).toBeInstanceOf(DocumentEmbedding);
      expect(embedding.chunkId.value).toBe(chunk.id.value);
      expect(embedding.documentId).toBe(documentId);
      expect(embedding.documentVersionId).toBe(versionId);
      expect(embedding.indexGenerationId.value).toBe(generationId);
      expect(embedding.dimensions).toBe(1024);
      expect(embedding.embeddingProfileId).toBe(profile.profileId);
      expect(embedding.contentFingerprint).toBeDefined();
      expect(embedding.contentFingerprint.length).toBe(64); // SHA-256 hex
    });

    it('processes multiple chunks in a single batch when under batch size', async () => {
      const chunks = [createChunk(0), createChunk(1), createChunk(2), createChunk(3)];

      const result = await pipelineService.generateEmbeddings({
        tenantId,
        documentId,
        documentVersionId: versionId,
        generationId,
        profile,
        chunks,
        batchSize: 16,
      });

      expect(mockProvider.generateBatchEmbeddings).toHaveBeenCalledTimes(1);
      expect(mockProvider.generateBatchEmbeddings).toHaveBeenCalledWith(
        chunks.map((c) => c.content),
        expect.objectContaining({ timeoutMs: 30000 }),
      );
      expect(result.successfulEmbeddings.length).toBe(4);
      expect(result.batchCount).toBe(1);
      expect(result.failedChunks.length).toBe(0);
    });

    it('splits large chunk set across multiple batches adhering to batchSize', async () => {
      const chunks = Array.from({ length: 5 }, (_, i) => createChunk(i));
      const progressUpdates: number[] = [];

      const result = await pipelineService.generateEmbeddings({
        tenantId,
        documentId,
        documentVersionId: versionId,
        generationId,
        profile,
        chunks,
        batchSize: 2, // 5 chunks / 2 = 3 batches (2, 2, 1)
        onProgress: (p) => {
          progressUpdates.push(p.percentComplete);
        },
      });

      expect(mockProvider.generateBatchEmbeddings).toHaveBeenCalledTimes(3);
      expect(result.batchCount).toBe(3);
      expect(result.successfulEmbeddings.length).toBe(5);
      expect(progressUpdates).toEqual([33, 67, 100]);
    });

    it('returns empty result gracefully when chunks array is empty', async () => {
      const result = await pipelineService.generateEmbeddings({
        tenantId,
        documentId,
        documentVersionId: versionId,
        generationId,
        profile,
        chunks: [],
      });

      expect(result.totalChunksRequested).toBe(0);
      expect(result.successfulEmbeddings.length).toBe(0);
      expect(result.batchCount).toBe(0);
      expect(mockProvider.generateBatchEmbeddings).not.toHaveBeenCalled();
    });
  });

  describe('Transient Retry & Resilience', () => {
    it('retries batch on transient timeout error and succeeds', async () => {
      const chunks = [createChunk(0), createChunk(1)];

      mockProvider.generateBatchEmbeddings
        .mockRejectedValueOnce(new ProviderTimeoutException('Ollama connection timeout'))
        .mockResolvedValueOnce([[...sampleVector1024], [...sampleVector1024]]);

      const result = await pipelineService.generateEmbeddings({
        tenantId,
        documentId,
        documentVersionId: versionId,
        generationId,
        profile,
        chunks,
        maxRetries: 2,
      });

      expect(result.successfulEmbeddings.length).toBe(2);
      expect(result.retryCount).toBe(1);
      expect(mockProvider.generateBatchEmbeddings).toHaveBeenCalledTimes(2);
    });

    it('falls back to individual chunk processing when batch retry fails, rescuing valid chunks', async () => {
      const chunkGood1 = createChunk(0, 'Primer texto válido');
      const chunkBad = createChunk(1, 'Texto que excede límite de tokens');
      const chunkGood2 = createChunk(2, 'Segundo texto válido');
      const chunks = [chunkGood1, chunkBad, chunkGood2];

      // Batch call fails repeatedly
      mockProvider.generateBatchEmbeddings.mockRejectedValue(
        new Error('Ollama batch processing failed: context length exceeded'),
      );

      // In individual fallback:
      mockProvider.generateEmbedding.mockImplementation(async (text: string) => {
        if (text.includes('excede')) {
          throw new EmbeddingValidationException(
            'Input too large for context window',
            VectorIndexingErrorCode.DIMENSION_MISMATCH,
          );
        }
        return [...sampleVector1024];
      });

      const result = await pipelineService.generateEmbeddings({
        tenantId,
        documentId,
        documentVersionId: versionId,
        generationId,
        profile,
        chunks,
        maxRetries: 1,
      });

      // Valid chunks should NOT be discarded
      expect(result.successfulEmbeddings.length).toBe(2);
      expect(result.successfulEmbeddings.map((e) => e.chunkId.value)).toEqual([
        chunkGood1.id.value,
        chunkGood2.id.value,
      ]);

      // Bad chunk should be recorded in failedChunks
      expect(result.failedChunks.length).toBe(1);
      expect(result.failedChunks[0]!.chunkId).toBe(chunkBad.id.value);
      expect(result.failedChunks[0]!.permanent).toBe(true);
      expect(result.failedChunks[0]!.errorCode).toBe(VectorIndexingErrorCode.DIMENSION_MISMATCH);
    });
  });

  describe('Cooperative Cancellation', () => {
    it('throws GenerationCancelledException if AbortSignal is already aborted', async () => {
      const abortController = new AbortController();
      abortController.abort();

      const chunks = [createChunk(0)];

      await expect(
        pipelineService.generateEmbeddings({
          tenantId,
          documentId,
          documentVersionId: versionId,
          generationId,
          profile,
          chunks,
          signal: abortController.signal,
        }),
      ).rejects.toThrow(GenerationCancelledException);

      expect(mockProvider.generateBatchEmbeddings).not.toHaveBeenCalled();
    });

    it('throws GenerationCancelledException if isCancelled hook returns true', async () => {
      const chunks = [createChunk(0)];

      await expect(
        pipelineService.generateEmbeddings({
          tenantId,
          documentId,
          documentVersionId: versionId,
          generationId,
          profile,
          chunks,
          isCancelled: async () => true,
        }),
      ).rejects.toThrow(GenerationCancelledException);

      expect(mockProvider.generateBatchEmbeddings).not.toHaveBeenCalled();
    });
  });

  describe('Source Chunk Validation & Integrity', () => {
    it('throws EmbeddingValidationException if chunk has mismatched documentId', async () => {
      const otherProvenance = ChunkProvenance.create({
        documentId: 'doc-mismatched-999',
        documentVersionId: versionId,
        chunkIndex: 0,
        pageNumber: 1,
        sectionHierarchy: ['Protocolo'],
        sourceBlockIds: ['b1'],
        language: 'es',
        checksum: validSha256,
        configurationVersion: 'v1-target450',
      });
      const chunkWithOtherDoc = DocumentChunk.create({
        id: 'chunk-mismatched-doc',
        documentId: 'doc-mismatched-999',
        documentVersionId: versionId,
        sequence: 0,
        content: 'Contenido clínico',
        tokenCount: 20,
        language: 'es',
        provenance: otherProvenance,
      });

      await expect(
        pipelineService.generateEmbeddings({
          tenantId,
          documentId, // 'doc-clinical-001'
          documentVersionId: versionId,
          generationId,
          profile,
          chunks: [chunkWithOtherDoc],
        }),
      ).rejects.toThrow(EmbeddingValidationException);
    });

    it('throws EmbeddingValidationException if chunk has mismatched documentVersionId', async () => {
      const otherProvenance = ChunkProvenance.create({
        documentId,
        documentVersionId: 'ver-mismatched-v2',
        chunkIndex: 0,
        pageNumber: 1,
        sectionHierarchy: ['Protocolo'],
        sourceBlockIds: ['b1'],
        language: 'es',
        checksum: validSha256,
        configurationVersion: 'v1-target450',
      });
      const chunkWithOtherVer = DocumentChunk.create({
        id: 'chunk-mismatched-ver',
        documentId,
        documentVersionId: 'ver-mismatched-v2',
        sequence: 0,
        content: 'Contenido clínico',
        tokenCount: 20,
        language: 'es',
        provenance: otherProvenance,
      });

      await expect(
        pipelineService.generateEmbeddings({
          tenantId,
          documentId,
          documentVersionId: versionId, // 'ver-clinical-001-v1'
          generationId,
          profile,
          chunks: [chunkWithOtherVer],
        }),
      ).rejects.toThrow(EmbeddingValidationException);
    });

    it('throws EmbeddingValidationException if chunk content is empty or whitespace', async () => {
      const corruptedChunk = {
        id: { value: 'chunk-empty' },
        documentId,
        documentVersionId: versionId,
        sequence: 0,
        content: '   ',
        tokenCount: 0,
        language: 'es',
        provenance: { checksum: validSha256 },
      } as unknown as DocumentChunk;

      await expect(
        pipelineService.generateEmbeddings({
          tenantId,
          documentId,
          documentVersionId: versionId,
          generationId,
          profile,
          chunks: [corruptedChunk],
        }),
      ).rejects.toThrow(EmbeddingValidationException);
    });

    it('throws EmbeddingValidationException if chunk sequence is negative', async () => {
      const corruptedChunk = {
        id: { value: 'chunk-neg' },
        documentId,
        documentVersionId: versionId,
        sequence: -1,
        content: 'Contenido válido',
        tokenCount: 10,
        language: 'es',
        provenance: { checksum: validSha256 },
      } as unknown as DocumentChunk;

      await expect(
        pipelineService.generateEmbeddings({
          tenantId,
          documentId,
          documentVersionId: versionId,
          generationId,
          profile,
          chunks: [corruptedChunk],
        }),
      ).rejects.toThrow(EmbeddingValidationException);
    });

    it('throws EmbeddingValidationException if chunk lacks provenance checksum', async () => {
      const chunkWithEmptyProv = {
        id: { value: 'chunk-no-prov' },
        documentId,
        documentVersionId: versionId,
        sequence: 0,
        content: 'Válido',
        tokenCount: 10,
        language: 'es',
        provenance: null as unknown as ChunkProvenance,
      } as unknown as DocumentChunk;

      await expect(
        pipelineService.generateEmbeddings({
          tenantId,
          documentId,
          documentVersionId: versionId,
          generationId,
          profile,
          chunks: [chunkWithEmptyProv],
        }),
      ).rejects.toThrow(EmbeddingValidationException);
    });
  });

  describe('Deterministic Fingerprinting', () => {
    it('produces identical fingerprints for identical chunk and profile inputs', () => {
      const chunkA = createChunk(0, 'Texto idéntico para verificación de huella');
      const chunkB = createChunk(0, 'Texto idéntico para verificación de huella');

      const fpA = pipelineService.calculateProcessingFingerprint(chunkA, profile);
      const fpB = pipelineService.calculateProcessingFingerprint(chunkB, profile);

      expect(fpA).toBe(fpB);
      expect(fpA).toHaveLength(64);
    });

    it('produces distinct fingerprints when chunk content changes', () => {
      const chunk1 = createChunk(0, 'Texto contenido original');
      const chunk2 = createChunk(0, 'Texto contenido modificado');

      const fp1 = pipelineService.calculateProcessingFingerprint(chunk1, profile);
      const fp2 = pipelineService.calculateProcessingFingerprint(chunk2, profile);

      expect(fp1).not.toBe(fp2);
    });

    it('produces distinct fingerprints when sequence changes', () => {
      const chunk1 = createChunk(0, 'Texto contenido');
      const chunk2 = createChunk(1, 'Texto contenido');

      const fp1 = pipelineService.calculateProcessingFingerprint(chunk1, profile);
      const fp2 = pipelineService.calculateProcessingFingerprint(chunk2, profile);

      expect(fp1).not.toBe(fp2);
    });

    it('produces distinct fingerprints when profile changes', () => {
      const chunk = createChunk(0, 'Texto contenido');
      const altProfile = EmbeddingProfile.create({
        provider: 'ollama',
        modelName: 'bge-m3',
        modelVersion: 'v2',
        modelDigest: 'different-digest-hash',
        dimensions: 1024,
        tokenizerIdentity: 'xlm-roberta',
        normalizationPolicy: profile.normalizationPolicy,
        poolingStrategy: profile.poolingStrategy,
      });

      const fp1 = pipelineService.calculateProcessingFingerprint(chunk, profile);
      const fp2 = pipelineService.calculateProcessingFingerprint(chunk, altProfile);

      expect(fp1).not.toBe(fp2);
    });
  });
});
