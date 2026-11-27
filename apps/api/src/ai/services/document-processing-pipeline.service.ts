import { Injectable, Inject, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  IDocumentParserPort,
  IDocumentNormalizerPort,
  IDocumentChunkerPort,
  IKnowledgeChunkRepositoryPort,
  DocumentChunk,
  DocumentFormat,
  ChunkingConfig,
  InvalidFormatExtractionException,
  EmptyExtractedDocumentException,
} from '@kinergy-platform/core';
import {
  DOCUMENT_PARSER_TOKEN,
  DOCUMENT_NORMALIZER_TOKEN,
  DOCUMENT_CHUNKER_TOKEN,
  KNOWLEDGE_CHUNK_REPOSITORY,
} from '../ai.tokens';
import {
  ObjectStoragePort,
  OBJECT_STORAGE_PORT,
} from '../../platform/storage/ports/object-storage.port';

export interface ProcessDocumentOptions {
  readonly tenantId: string;
  readonly documentId: string;
  readonly versionId: string;
  readonly versionNumber: number;
  readonly mimeType: string;
  readonly buffer: Uint8Array;
  readonly config?: ChunkingConfig;
  readonly isCancelled?: () => Promise<boolean>;
}

export interface DocumentProcessingResult {
  readonly documentId: string;
  readonly versionId: string;
  readonly sourceFormat: DocumentFormat;
  readonly characterCount: number;
  readonly blockCount: number;
  readonly chunkCount: number;
  readonly totalTokens: number;
  readonly averageChunkTokens: number;
  readonly maxChunkTokens: number;
  readonly pageCount: number | null;
  readonly detectedLanguage: string;
  readonly processingFingerprint: string;
  readonly durationMs: number;
  readonly chunks: readonly DocumentChunk[];
}

export class PipelineCancelledException extends Error {
  constructor(message = 'Document processing pipeline was cancelled cooperatively.') {
    super(message);
    this.name = 'PipelineCancelledException';
  }
}

/**
 * Service that orchestrates the pure document processing pipeline:
 * Format Validation -> Structured Extraction -> Normalization & Language Detection ->
 * Structure-Aware Chunking -> Deterministic Fingerprinting -> Atomic Persistence & Archiving.
 */
@Injectable()
export class DocumentProcessingPipelineService {
  private readonly logger = new Logger(DocumentProcessingPipelineService.name);

  constructor(
    @Inject(DOCUMENT_PARSER_TOKEN)
    private readonly parser: IDocumentParserPort,
    @Inject(DOCUMENT_NORMALIZER_TOKEN)
    private readonly normalizer: IDocumentNormalizerPort,
    @Inject(DOCUMENT_CHUNKER_TOKEN)
    private readonly chunker: IDocumentChunkerPort,
    @Inject(KNOWLEDGE_CHUNK_REPOSITORY)
    private readonly chunkRepo: IKnowledgeChunkRepositoryPort,
    @Inject(OBJECT_STORAGE_PORT)
    private readonly storagePort: ObjectStoragePort,
  ) {}

  /**
   * Executes the full document transformation and chunking pipeline.
   */
  public async processDocument(options: ProcessDocumentOptions): Promise<DocumentProcessingResult> {
    const startTime = Date.now();
    const { tenantId, documentId, versionId, versionNumber, mimeType, buffer } = options;

    // Guard: Non-empty buffer
    if (!buffer || buffer.length === 0) {
      throw new EmptyExtractedDocumentException(documentId, versionId, {
        reason: 'Source document file buffer is empty (0 bytes).',
      });
    }

    // Step 1: Format Mapping & Compatibility Check
    const format = this.resolveFormat(mimeType);
    const compatibility = await this.parser.validateCompatibility(buffer, format);
    if (!compatibility.isCompatible) {
      throw new InvalidFormatExtractionException(
        compatibility.rejectionReason ?? `MIME type '${mimeType}' is incompatible with parser.`,
      );
    }

    await this.assertNotCancelled(options.isCancelled);

    // Step 2: Structured Document Extraction
    const extractedDoc = await this.parser.parse({
      tenantId,
      documentId,
      documentVersionId: versionId,
      buffer,
      format,
    });

    if (!extractedDoc || extractedDoc.blocks.length === 0) {
      throw new EmptyExtractedDocumentException(documentId, versionId, {
        reason: 'Parser yielded zero structural blocks from document source.',
      });
    }

    await this.assertNotCancelled(options.isCancelled);

    // Step 3: Normalization & Language Detection
    const normalizedDoc = await this.normalizer.normalize(extractedDoc);

    await this.assertNotCancelled(options.isCancelled);

    // Step 4: Tokenization & Structure-Aware Chunking
    const chunkingConfig = options.config ?? ChunkingConfig.default();
    const chunks = this.chunker.chunk(normalizedDoc, chunkingConfig);

    if (chunks.length === 0) {
      throw new EmptyExtractedDocumentException(documentId, versionId, {
        reason: 'Chunking engine produced zero chunks from normalized document.',
      });
    }

    // Security invariant: Validate chunk provenance matches authoritative document and version IDs
    for (const chunk of chunks) {
      if (chunk.documentId !== documentId || chunk.documentVersionId !== versionId) {
        throw new Error(
          `Chunk provenance violation detected: chunk documentId '${chunk.documentId}' does not match authoritative documentId '${documentId}'.`,
        );
      }
    }

    await this.assertNotCancelled(options.isCancelled);

    // Step 5: Compute Deterministic Processing Fingerprint
    const processingFingerprint = this.computeFingerprint({
      versionId,
      parserName: this.parser.parserName,
      normalizerVersion: normalizedDoc.normalizationConfig.version,
      chunkingStrategy: chunkingConfig.strategy,
      chunkingConfigVersion: chunkingConfig.version,
      chunks,
    });

    // Step 6: Atomic Persistence to Relational Database
    await this.chunkRepo.saveChunks(tenantId, documentId, versionId, chunks);

    // Step 7: Archival Summary to Object Storage (asynchronous offline provenance)
    await this.archiveProcessingArtifact(tenantId, documentId, versionId, {
      documentId,
      versionId,
      versionNumber,
      format,
      processingFingerprint,
      chunkCount: chunks.length,
      processedAt: new Date().toISOString(),
    });

    // Step 8: Calculate Observability Metrics
    const durationMs = Date.now() - startTime;
    const totalTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);
    const avgChunkTokens = Math.round(totalTokens / chunks.length);
    const maxChunkTokens = Math.max(...chunks.map((c) => c.tokenCount));
    const totalChars = chunks.reduce((sum, c) => sum + c.content.length, 0);
    const detectedLanguage = normalizedDoc.documentLanguage.language;

    // Safe operational logging: zero document content or sensitive text exposed
    this.logger.log(
      `Document '${documentId}' v${versionNumber} processed in ${durationMs}ms [Format: ${format}, Chunks: ${chunks.length}, TotalTokens: ${totalTokens}, AvgTokens: ${avgChunkTokens}, MaxTokens: ${maxChunkTokens}, Lang: ${detectedLanguage}, Fingerprint: ${processingFingerprint.slice(0, 12)}...]`,
    );

    return {
      documentId,
      versionId,
      sourceFormat: format,
      characterCount: totalChars,
      blockCount: normalizedDoc.blocks.length,
      chunkCount: chunks.length,
      totalTokens,
      averageChunkTokens: avgChunkTokens,
      maxChunkTokens,
      pageCount: extractedDoc.metadata.pageCount ?? null,
      detectedLanguage,
      processingFingerprint,
      durationMs,
      chunks,
    };
  }

  /**
   * Resolves MIME type string to strongly-typed DocumentFormat enum.
   */
  private resolveFormat(mimeType: string): DocumentFormat {
    const norm = (mimeType || '').trim().toLowerCase();
    if (norm === 'application/pdf') return DocumentFormat.PDF;
    if (norm === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      return DocumentFormat.DOCX;
    }
    if (norm === 'text/markdown' || norm === 'text/x-markdown') return DocumentFormat.MARKDOWN;
    if (norm === 'text/plain') return DocumentFormat.TXT;

    throw new InvalidFormatExtractionException(
      `Unsupported or unmapped MIME type: '${mimeType}'. Supported: PDF, DOCX, Markdown, Plain Text.`,
    );
  }

  /**
   * Cooperative cancellation check between processing stages.
   */
  private async assertNotCancelled(isCancelled?: () => Promise<boolean>): Promise<void> {
    if (!isCancelled) return;
    const cancelled = await isCancelled();
    if (cancelled) {
      throw new PipelineCancelledException();
    }
  }

  /**
   * Computes deterministic SHA-256 processing fingerprint across pipeline inputs and chunk lineage.
   */
  private computeFingerprint(params: {
    versionId: string;
    parserName: string;
    normalizerVersion: string;
    chunkingStrategy: string;
    chunkingConfigVersion: string;
    chunks: readonly DocumentChunk[];
  }): string {
    const chunkDigests = params.chunks.map((c) => `${c.sequence}:${c.checksum}`).join('|');
    const payload = `${params.versionId}:${params.parserName}:${params.normalizerVersion}:${params.chunkingStrategy}:${params.chunkingConfigVersion}:${params.chunks.length}:${chunkDigests}`;

    return createHash('sha256').update(payload, 'utf8').digest('hex');
  }

  /**
   * Archives a light processing manifest into object storage for decoupled provenance inspection.
   */
  private async archiveProcessingArtifact(
    tenantId: string,
    documentId: string,
    versionId: string,
    manifest: Record<string, unknown>,
  ): Promise<void> {
    try {
      const filename = `processing-result-${documentId}-${versionId}.json`;
      const buffer = Buffer.from(JSON.stringify(manifest, null, 2), 'utf8');

      await this.storagePort.upload(
        tenantId,
        'knowledge_base',
        filename,
        buffer,
        'application/json',
      );
    } catch (err: unknown) {
      // Non-fatal: Storage artifact archiving failure must not abort successful database persistence
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to archive processing result artifact to storage: ${msg}`);
    }
  }
}
