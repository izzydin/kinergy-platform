import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  IDocumentParserPort,
  ParseDocumentRequest,
  FormatCompatibilityResult,
  DocumentFormat,
  ExtractedDocument,
  ExtractedBlock,
  ExtractedBlockType,
  SourceLocation,
  InvalidFormatExtractionException,
  EmptyExtractedDocumentException,
  ExtractionTimeoutException,
  ExtractionResourceLimitExceededException,
  classifyExtractionError,
} from '@kinergy-platform/core';

export interface PlainTextParserOptions {
  maxSizeBytes?: number;
  timeoutMs?: number;
}

const DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

/**
 * Concrete Plain Text parser adapter implementing IDocumentParserPort using native Node.js TextDecoder.
 * Handles UTF-8, UTF-8 BOM, Spanish accents, CRLF/LF normalization,
 * detects binary content disguised as text, and records line-range provenance.
 */
@Injectable()
export class PlainTextParserAdapter implements IDocumentParserPort {
  public readonly parserName = 'native-plain-text-parser';
  private readonly logger = new Logger(PlainTextParserAdapter.name);

  constructor(@Optional() private readonly options: PlainTextParserOptions = {}) {}

  public supportsFormat(format: DocumentFormat): boolean {
    return format === DocumentFormat.TXT;
  }

  public async validateCompatibility(
    buffer: Uint8Array,
    format: DocumentFormat,
  ): Promise<FormatCompatibilityResult> {
    if (format !== DocumentFormat.TXT) {
      return {
        isCompatible: false,
        format,
        rejectionReason: `Format '${format}' is not supported by PlainTextParserAdapter.`,
      };
    }

    const maxBytes = this.options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
    if (buffer.length > maxBytes) {
      return {
        isCompatible: false,
        format,
        rejectionReason: `Text file size (${buffer.length} bytes) exceeds limit of ${maxBytes} bytes.`,
      };
    }

    const nodeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

    // Rejection of binary null bytes
    if (nodeBuffer.includes(0x00)) {
      return {
        isCompatible: false,
        format,
        rejectionReason: 'Binary null bytes detected. File is not plain text.',
      };
    }

    return {
      isCompatible: true,
      format,
      detectedMimeType: 'text/plain',
    };
  }

  public async parse(request: ParseDocumentRequest): Promise<ExtractedDocument> {
    const startTime = Date.now();
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBytes = request.maxSizeBytes ?? this.options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;

    if (request.buffer.length > maxBytes) {
      throw new ExtractionResourceLimitExceededException(
        'Plain text buffer size',
        request.buffer.length,
        maxBytes,
        request.documentId,
        request.documentVersionId,
      );
    }

    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new ExtractionTimeoutException(timeoutMs, request.documentId, request.documentVersionId),
        );
      }, timeoutMs);
      if (typeof timer.unref === 'function') timer.unref();
    });

    try {
      return await Promise.race([this.executeExtraction(request, startTime), timeoutPromise]);
    } catch (error: unknown) {
      if (
        error instanceof ExtractionTimeoutException ||
        error instanceof ExtractionResourceLimitExceededException ||
        error instanceof InvalidFormatExtractionException ||
        error instanceof EmptyExtractedDocumentException
      ) {
        throw error;
      }

      const classified = classifyExtractionError(
        error,
        request.documentId,
        request.documentVersionId,
      );
      this.logger.error(
        `Plain text extraction failure on doc '${request.documentId}' v'${request.documentVersionId}': ${classified.message}`,
      );

      throw new InvalidFormatExtractionException(
        classified.message,
        request.documentId,
        request.documentVersionId,
      );
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async executeExtraction(
    request: ParseDocumentRequest,
    startTime: number,
  ): Promise<ExtractedDocument> {
    const nodeBuffer = Buffer.isBuffer(request.buffer)
      ? request.buffer
      : Buffer.from(request.buffer);

    // 1. Binary detection: check for null bytes
    if (nodeBuffer.includes(0x00)) {
      throw new InvalidFormatExtractionException(
        'Binary null bytes detected. Input buffer is not a valid text document.',
        request.documentId,
        request.documentVersionId,
      );
    }

    // 2. Decode text (supporting UTF-8 BOM, Latin-1 fallback)
    const decoded = this.decodeBufferWithEncodingDetection(nodeBuffer, request);

    const cleanText = decoded.text.trim();
    if (cleanText.length === 0) {
      throw new EmptyExtractedDocumentException(request.documentId, request.documentVersionId, {
        reason: 'Plain text document is empty.',
      });
    }

    // 3. Normalize newlines (\r\n -> \n)
    const normalizedText = cleanText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // 4. Split into paragraph blocks while tracking line ranges
    const rawLines = normalizedText.split('\n');
    const blocks: ExtractedBlock[] = [];
    let sequenceCounter = 0;

    let currentParagraphLines: string[] = [];
    let currentStartLine = 1;

    for (let i = 0; i < rawLines.length; i++) {
      const lineNum = i + 1;
      const line = rawLines[i] ?? '';

      if (line.trim().length === 0) {
        // Empty line indicates paragraph boundary
        if (currentParagraphLines.length > 0) {
          const paraText = currentParagraphLines.join(' ').trim();
          if (paraText.length > 0) {
            blocks.push(
              ExtractedBlock.create({
                type: ExtractedBlockType.PARAGRAPH,
                text: paraText,
                sequence: sequenceCounter++,
                pageNumber: null, // Unpaginated
                location: SourceLocation.create({
                  pageNumber: null,
                  startLine: currentStartLine,
                  endLine: lineNum - 1,
                }),
              }),
            );
          }
          currentParagraphLines = [];
        }
        currentStartLine = lineNum + 1;
      } else {
        if (currentParagraphLines.length === 0) {
          currentStartLine = lineNum;
        }
        currentParagraphLines.push(line.trim());
      }
    }

    // Flush final paragraph
    if (currentParagraphLines.length > 0) {
      const paraText = currentParagraphLines.join(' ').trim();
      if (paraText.length > 0) {
        blocks.push(
          ExtractedBlock.create({
            type: ExtractedBlockType.PARAGRAPH,
            text: paraText,
            sequence: sequenceCounter,
            pageNumber: null,
            location: SourceLocation.create({
              pageNumber: null,
              startLine: currentStartLine,
              endLine: rawLines.length,
            }),
          }),
        );
      }
    }

    if (blocks.length === 0) {
      throw new EmptyExtractedDocumentException(request.documentId, request.documentVersionId, {
        reason: 'No paragraphs could be derived from plain text content.',
      });
    }

    const durationMs = Date.now() - startTime;
    const firstBlockText = blocks[0]?.text?.trim() ?? '';
    const candidateTitle =
      firstBlockText.length > 0 && firstBlockText.length < 100 && !firstBlockText.includes('\n')
        ? firstBlockText
        : null;

    return ExtractedDocument.create({
      documentId: request.documentId,
      documentVersionId: request.documentVersionId,
      sourceFormat: DocumentFormat.TXT,
      title: candidateTitle ?? request.originalFileName?.replace(/\.txt$/i, '') ?? null,
      languageHint: request.languageHint ?? 'es',
      blocks,
      metadata: {
        parserName: this.parserName,
        parserVersion: '1.0.0',
        pageCount: null,
        totalChars: normalizedText.length,
        custom: {
          executionDurationMs: durationMs,
          encoding: decoded.encoding,
          detectedEncoding: decoded.encoding,
          hasBom: decoded.hasBom,
          lineCount: rawLines.length,
        },
      },
      extractedAt: new Date(),
    });
  }

  /**
   * Safely decodes a text buffer, detecting BOM, validating UTF-8 fatal mode,
   * and providing safe fallback to ISO-8859-1 for legacy Spanish clinic documents.
   */
  private decodeBufferWithEncodingDetection(
    buffer: Buffer,
    request: ParseDocumentRequest,
  ): { text: string; encoding: string; hasBom: boolean } {
    let hasBom = false;
    let sliceStart = 0;

    // Check UTF-8 BOM (0xEF, 0xBB, 0xBF)
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
      hasBom = true;
      sliceStart = 3;
    }

    // Attempt 1: Strict UTF-8 decoding
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      const decodedText = decoder.decode(buffer.subarray(sliceStart));

      // Sanity check: Ensure non-printable control characters are bounded
      this.assertNoPathologicalControlChars(decodedText, request);

      return { text: decodedText, encoding: 'UTF-8', hasBom };
    } catch {
      // If BOM was declared but decoding failed, it's corrupt UTF-8
      if (hasBom) {
        throw new InvalidFormatExtractionException(
          'Corrupted UTF-8 text with invalid byte sequences despite UTF-8 BOM.',
          request.documentId,
          request.documentVersionId,
        );
      }
    }

    // Attempt 2: Fallback to ISO-8859-1 (Latin-1) for legacy Spanish files
    try {
      const decoder = new TextDecoder('iso-8859-1', { fatal: false });
      const decodedText = decoder.decode(buffer);

      // Check for replacement character contamination (>1% threshold)
      const replacementCount = (decodedText.match(/\uFFFD/g) || []).length;
      if (replacementCount > 0 && replacementCount / decodedText.length > 0.01) {
        throw new InvalidFormatExtractionException(
          'Text decoding produced excessive replacement characters (unsupported binary/legacy encoding).',
          request.documentId,
          request.documentVersionId,
        );
      }

      this.assertNoPathologicalControlChars(decodedText, request);

      return { text: decodedText, encoding: 'ISO-8859-1', hasBom: false };
    } catch (err: unknown) {
      if (err instanceof InvalidFormatExtractionException) throw err;
      throw new InvalidFormatExtractionException(
        'Unable to decode plain text buffer with supported encodings (UTF-8, ISO-8859-1).',
        request.documentId,
        request.documentVersionId,
      );
    }
  }

  private assertNoPathologicalControlChars(text: string, request: ParseDocumentRequest): void {
    let controlCharCount = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      // Allowed: tab (9), lf (10), cr (13)
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
        controlCharCount++;
      }
    }

    if (controlCharCount > 0 && controlCharCount / text.length > 0.05) {
      throw new InvalidFormatExtractionException(
        `File contains excessive binary control characters (${controlCharCount}), indicating binary content disguised as text.`,
        request.documentId,
        request.documentVersionId,
      );
    }
  }
}
