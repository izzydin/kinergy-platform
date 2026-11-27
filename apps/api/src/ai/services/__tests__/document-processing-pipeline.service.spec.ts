import {
  DocumentProcessingPipelineService,
  PipelineCancelledException,
} from '../document-processing-pipeline.service';
import { CompositeDocumentParserAdapter } from '../../adapters/parsers';
import { DeterministicDocumentNormalizerService } from '../normalization/deterministic-document-normalizer.service';
import { DeterministicLanguageDetectorService } from '../normalization/deterministic-language-detector.service';
import { StructureAwareChunkerService } from '../chunking/structure-aware-chunker.service';
import { DeterministicBpeTokenizerAdapter } from '../../adapters/tokenizers/deterministic-bpe-tokenizer.adapter';
import {
  IDocumentParserPort,
  IKnowledgeChunkRepositoryPort,
  DocumentFormat,
  EmptyExtractedDocumentException,
  InvalidFormatExtractionException,
  ExtractionTimeoutException,
} from '@kinergy-platform/core';
import { ObjectStoragePort } from '../../../platform/storage/ports/object-storage.port';

describe('DocumentProcessingPipelineService', () => {
  let pipeline: DocumentProcessingPipelineService;
  let compositeParser: CompositeDocumentParserAdapter;
  let normalizer: DeterministicDocumentNormalizerService;
  let languageDetector: DeterministicLanguageDetectorService;
  let tokenizer: DeterministicBpeTokenizerAdapter;
  let chunker: StructureAwareChunkerService;
  let mockChunkRepo: jest.Mocked<IKnowledgeChunkRepositoryPort>;
  let mockStorage: jest.Mocked<ObjectStoragePort>;

  const tenantId = 'tenant_clinic_pipeline_01';
  const documentId = 'doc-clinical-pipe-100';
  const versionId = 'ver-clinical-pipe-100-v1';

  beforeEach(() => {
    // 1. Concrete composite parser adapter
    compositeParser = new CompositeDocumentParserAdapter();

    // 2. Concrete normalization & language detection
    languageDetector = new DeterministicLanguageDetectorService();
    normalizer = new DeterministicDocumentNormalizerService(languageDetector);

    // 3. Concrete tokenizer & chunker
    tokenizer = new DeterministicBpeTokenizerAdapter();
    chunker = new StructureAwareChunkerService(tokenizer);

    // 4. Mock Chunk Repository
    mockChunkRepo = {
      saveChunks: jest.fn().mockResolvedValue(undefined),
      findByVersionId: jest.fn().mockResolvedValue([]),
      findById: jest.fn().mockResolvedValue(null),
      deleteByVersionId: jest.fn().mockResolvedValue(0),
      countByVersionId: jest.fn().mockResolvedValue(0),
    };

    // 5. Mock Object Storage
    mockStorage = {
      upload: jest.fn().mockResolvedValue({ storageKey: 'some-key', versionId: 'v1' }),
      download: jest.fn(),
      exists: jest.fn().mockResolvedValue(true),
      delete: jest.fn().mockResolvedValue(undefined),
      getMetadata: jest.fn(),
      createPresignedDownloadUrl: jest.fn(),
      createPresignedUploadUrl: jest.fn(),
    };

    pipeline = new DocumentProcessingPipelineService(
      compositeParser,
      normalizer,
      chunker,
      mockChunkRepo,
      mockStorage,
    );
  });

  describe('Full Pipeline Execution across formats', () => {
    it('should process Plain Text document through complete pipeline into persisted chunks', async () => {
      const textContent =
        'Protocolo de Kinesiología Respiratoria.\n\n' +
        'El tratamiento se enfoca en la desobstrucción bronquial mediante técnicas de espiración lenta prolongada. ' +
        'Se recomienda auscultación pulmonar antes y después de cada sesión terapéutica.';
      const buffer = Buffer.from(textContent, 'utf8');

      const result = await pipeline.processDocument({
        tenantId,
        documentId,
        versionId,
        versionNumber: 1,
        mimeType: 'text/plain',
        buffer,
      });

      expect(result.documentId).toBe(documentId);
      expect(result.versionId).toBe(versionId);
      expect(result.sourceFormat).toBe(DocumentFormat.TXT);
      expect(result.chunkCount).toBeGreaterThan(0);
      expect(result.totalTokens).toBeGreaterThan(10);
      expect(result.averageChunkTokens).toBeGreaterThan(0);
      expect(result.detectedLanguage).toBe('es');
      expect(result.processingFingerprint).toMatch(/^[a-f0-9]{64}$/);
      expect(result.durationMs).toBeGreaterThanOrEqual(0);

      // Verify persistence
      expect(mockChunkRepo.saveChunks).toHaveBeenCalledTimes(1);
      const savedChunks = mockChunkRepo.saveChunks.mock.calls[0]![3];
      expect(savedChunks.length).toBe(result.chunkCount);
      expect(savedChunks[0]!.documentId).toBe(documentId);
      expect(savedChunks[0]!.documentVersionId).toBe(versionId);

      // Verify artifact storage
      expect(mockStorage.upload).toHaveBeenCalledTimes(1);
    });

    it('should process Markdown document with structural tables and lists through pipeline', async () => {
      const mdContent =
        '# Guía de Evaluación Articular\n\n' +
        '## 1. Pautas Generales\n\n' +
        '* Inspección visual de simetría bilateral.\n' +
        '* Palpación de temperatura local y edema.\n' +
        '* Medición con goniómetro estándar.\n\n' +
        '| Articulación | Flexión Normal | Extensión Normal |\n' +
        '| --- | --- | --- |\n' +
        '| Hombro | 180° | 60° |\n' +
        '| Codo | 150° | 0° |\n';
      const buffer = Buffer.from(mdContent, 'utf8');

      const result = await pipeline.processDocument({
        tenantId,
        documentId,
        versionId,
        versionNumber: 1,
        mimeType: 'text/markdown',
        buffer,
      });

      expect(result.sourceFormat).toBe(DocumentFormat.MARKDOWN);
      expect(result.chunkCount).toBeGreaterThan(0);
      expect(result.blockCount).toBeGreaterThan(3);

      const chunk = result.chunks[0]!;
      expect(chunk.metadata['blockTypes']).toBeDefined();
      expect(mockChunkRepo.saveChunks).toHaveBeenCalledWith(
        tenantId,
        documentId,
        versionId,
        expect.any(Array),
      );
    });
  });

  describe('Error Handling & Invariants', () => {
    it('should reject empty document buffer (0 bytes)', async () => {
      await expect(
        pipeline.processDocument({
          tenantId,
          documentId,
          versionId,
          versionNumber: 1,
          mimeType: 'text/plain',
          buffer: new Uint8Array([]),
        }),
      ).rejects.toThrow(EmptyExtractedDocumentException);

      expect(mockChunkRepo.saveChunks).not.toHaveBeenCalled();
    });

    it('should reject unsupported MIME types with InvalidFormatExtractionException', async () => {
      const buffer = Buffer.from('some data', 'utf8');

      await expect(
        pipeline.processDocument({
          tenantId,
          documentId,
          versionId,
          versionNumber: 1,
          mimeType: 'application/x-tar',
          buffer,
        }),
      ).rejects.toThrow(InvalidFormatExtractionException);

      expect(mockChunkRepo.saveChunks).not.toHaveBeenCalled();
    });

    it('should abort and propagate persistence failure without marking success', async () => {
      mockChunkRepo.saveChunks.mockRejectedValueOnce(new Error('Database deadlock on write'));

      const buffer = Buffer.from('Contenido de prueba para fallo de persistencia.', 'utf8');

      await expect(
        pipeline.processDocument({
          tenantId,
          documentId,
          versionId,
          versionNumber: 1,
          mimeType: 'text/plain',
          buffer,
        }),
      ).rejects.toThrow('Database deadlock on write');
    });

    it('should propagate parser timeout exception without proceeding to chunking', async () => {
      const mockParser: IDocumentParserPort = {
        parserName: 'timeout-mock-parser',
        supportsFormat: () => true,
        validateCompatibility: async () => ({ isCompatible: true, format: DocumentFormat.TXT }),
        parse: async () => {
          throw new ExtractionTimeoutException(30000, 'Mock parser timeout');
        },
      };

      const timeoutPipeline = new DocumentProcessingPipelineService(
        mockParser,
        normalizer,
        chunker,
        mockChunkRepo,
        mockStorage,
      );

      const buffer = Buffer.from('Contenido que gatilla timeout.', 'utf8');

      await expect(
        timeoutPipeline.processDocument({
          tenantId,
          documentId,
          versionId,
          versionNumber: 1,
          mimeType: 'text/plain',
          buffer,
        }),
      ).rejects.toThrow(ExtractionTimeoutException);

      expect(mockChunkRepo.saveChunks).not.toHaveBeenCalled();
    });
  });

  describe('Cooperative Cancellation Between Pipeline Stages', () => {
    it('should abort cleanly before parsing when cancellation is detected', async () => {
      const buffer = Buffer.from('Texto no procesado por cancelación temprana.', 'utf8');

      await expect(
        pipeline.processDocument({
          tenantId,
          documentId,
          versionId,
          versionNumber: 1,
          mimeType: 'text/plain',
          buffer,
          isCancelled: async () => true,
        }),
      ).rejects.toThrow(PipelineCancelledException);

      expect(mockChunkRepo.saveChunks).not.toHaveBeenCalled();
    });

    it('should abort cleanly mid-pipeline if cancellation flag turns true', async () => {
      let callCount = 0;
      const isCancelled = async () => {
        callCount++;
        // Allow initial format check, cancel right before normalization
        return callCount >= 2;
      };

      const buffer = Buffer.from('Texto que se cancela durante el pipeline.', 'utf8');

      await expect(
        pipeline.processDocument({
          tenantId,
          documentId,
          versionId,
          versionNumber: 1,
          mimeType: 'text/plain',
          buffer,
          isCancelled,
        }),
      ).rejects.toThrow(PipelineCancelledException);

      expect(mockChunkRepo.saveChunks).not.toHaveBeenCalled();
    });
  });

  describe('Deterministic Fingerprinting & Idempotency', () => {
    it('should produce identical fingerprints on two consecutive runs of identical content', async () => {
      const text = 'Pauta de ejercicios para fortalecimiento muscular del manguito rotador.';
      const buffer = Buffer.from(text, 'utf8');

      const result1 = await pipeline.processDocument({
        tenantId,
        documentId,
        versionId,
        versionNumber: 1,
        mimeType: 'text/plain',
        buffer,
      });

      const result2 = await pipeline.processDocument({
        tenantId,
        documentId,
        versionId,
        versionNumber: 1,
        mimeType: 'text/plain',
        buffer,
      });

      expect(result1.processingFingerprint).toBe(result2.processingFingerprint);
      expect(result1.chunkCount).toBe(result2.chunkCount);
      expect(result1.totalTokens).toBe(result2.totalTokens);
    });

    it('should produce a different fingerprint when content or document version changes', async () => {
      const bufferA = Buffer.from('Texto versión A de evaluación clínica.', 'utf8');
      const bufferB = Buffer.from('Texto versión B con ajustes terapéuticos diferentes.', 'utf8');

      const resultA = await pipeline.processDocument({
        tenantId,
        documentId,
        versionId: 'ver-1',
        versionNumber: 1,
        mimeType: 'text/plain',
        buffer: bufferA,
      });

      const resultB = await pipeline.processDocument({
        tenantId,
        documentId,
        versionId: 'ver-2',
        versionNumber: 2,
        mimeType: 'text/plain',
        buffer: bufferB,
      });

      expect(resultA.processingFingerprint).not.toBe(resultB.processingFingerprint);
    });
  });
});
