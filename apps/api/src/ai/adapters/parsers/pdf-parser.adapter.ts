import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  IDocumentParserPort,
  ParseDocumentRequest,
  FormatCompatibilityResult,
  DocumentFormat,
  ExtractedDocument,
  ExtractedBlock,
  ExtractedBlockType,
  InvalidFormatExtractionException,
  EmptyExtractedDocumentException,
  UnsupportedDocumentFeatureException,
  ExtractionTimeoutException,
  ExtractionResourceLimitExceededException,
  classifyExtractionError,
} from '@kinergy-platform/core';

export interface PdfParserOptions {
  maxSizeBytes?: number;
  timeoutMs?: number;
  maxPages?: number;
}

const DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds
const DEFAULT_MAX_PAGES = 500; // 500 pages maximum

let cachedExtractText:
  | ((
      data: Uint8Array | ArrayBuffer | Buffer,
      options?: { mergePages?: boolean },
    ) => Promise<{ totalPages: number; text: string | string[]; lines?: string[] }>)
  | null = null;

async function getExtractText() {
  if (!cachedExtractText) {
    const dynamicImport = new Function('s', 'return import(s)') as (s: string) => Promise<{
      extractText: (
        data: Uint8Array | ArrayBuffer | Buffer,
        options?: { mergePages?: boolean },
      ) => Promise<{ totalPages: number; text: string | string[]; lines?: string[] }>;
    }>;
    const mod = await dynamicImport('unpdf');
    cachedExtractText = mod.extractText;
  }
  return cachedExtractText;
}

/**
 * Concrete PDF parser adapter implementing IDocumentParserPort using pure JS unpdf.
 * Preserves 1-indexed page boundaries, detects image-only/scanned PDFs requiring OCR,
 * and guards against encrypted or malformed PDF payloads.
 */
@Injectable()
export class PdfParserAdapter implements IDocumentParserPort {
  public readonly parserName = 'unpdf-pdf-parser';
  private readonly logger = new Logger(PdfParserAdapter.name);

  constructor(@Optional() private readonly options: PdfParserOptions = {}) {}

  public supportsFormat(format: DocumentFormat): boolean {
    return format === DocumentFormat.PDF;
  }

  public async validateCompatibility(
    buffer: Uint8Array,
    format: DocumentFormat,
  ): Promise<FormatCompatibilityResult> {
    if (format !== DocumentFormat.PDF) {
      return {
        isCompatible: false,
        format,
        rejectionReason: `Format '${format}' is not supported by PdfParserAdapter.`,
      };
    }

    const maxBytes = this.options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
    if (buffer.length > maxBytes) {
      return {
        isCompatible: false,
        format,
        rejectionReason: `PDF size (${buffer.length} bytes) exceeds limit of ${maxBytes} bytes.`,
      };
    }

    const nodeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    const rawAscii = nodeBuffer.toString('latin1', 0, Math.min(nodeBuffer.length, 4096));

    // Check version header (%PDF-1.x or %PDF-2.x)
    if (!/^%PDF-[12]\.[0-9]/.test(rawAscii)) {
      return {
        isCompatible: false,
        format,
        rejectionReason: 'Invalid or missing PDF version header.',
      };
    }

    // Check encryption
    const fullAscii = nodeBuffer.toString('latin1');
    if (fullAscii.includes('/Encrypt')) {
      return {
        isCompatible: false,
        format,
        rejectionReason: 'PDF document is encrypted or password-protected.',
        unsupportedFeatures: ['ENCRYPTED_PDF'],
      };
    }

    return {
      isCompatible: true,
      format,
      detectedMimeType: 'application/pdf',
    };
  }

  public async parse(request: ParseDocumentRequest): Promise<ExtractedDocument> {
    const startTime = Date.now();
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBytes = request.maxSizeBytes ?? this.options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
    const maxPages = this.options.maxPages ?? DEFAULT_MAX_PAGES;

    if (request.buffer.length > maxBytes) {
      throw new ExtractionResourceLimitExceededException(
        'PDF buffer size',
        request.buffer.length,
        maxBytes,
        request.documentId,
        request.documentVersionId,
      );
    }

    // Timeout-wrapped execution
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
      return await Promise.race([
        this.executeExtraction(request, maxPages, startTime),
        timeoutPromise,
      ]);
    } catch (error: unknown) {
      if (
        error instanceof ExtractionTimeoutException ||
        error instanceof ExtractionResourceLimitExceededException ||
        error instanceof UnsupportedDocumentFeatureException ||
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
        `PDF extraction error on doc '${request.documentId}' v'${request.documentVersionId}': ${classified.message}`,
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
    maxPages: number,
    startTime: number,
  ): Promise<ExtractedDocument> {
    const nodeBuffer = Buffer.isBuffer(request.buffer)
      ? request.buffer
      : Buffer.from(request.buffer);

    // 1. Static preflight security checks
    const header = nodeBuffer.toString('latin1', 0, Math.min(nodeBuffer.length, 1024));
    if (!/^%PDF-[12]\.[0-9]/.test(header)) {
      throw new InvalidFormatExtractionException(
        'Invalid or missing %PDF header.',
        request.documentId,
        request.documentVersionId,
      );
    }

    const fullAscii = nodeBuffer.toString('latin1');
    if (fullAscii.includes('/Encrypt')) {
      throw new UnsupportedDocumentFeatureException(
        'PDF document is password-protected or encrypted (ENCRYPTED_PDF). Decryption is required.',
        request.documentId,
        request.documentVersionId,
      );
    }

    // 2. Perform page-by-page extraction via unpdf
    const extractText = await getExtractText();
    const extractionResult = await extractText(nodeBuffer, { mergePages: false });

    const totalPages = extractionResult.totalPages ?? 0;
    const pagesText = Array.isArray(extractionResult.text)
      ? extractionResult.text
      : typeof extractionResult.text === 'string'
        ? [extractionResult.text]
        : [];

    if (totalPages > maxPages) {
      throw new ExtractionResourceLimitExceededException(
        'PDF page count',
        totalPages,
        maxPages,
        request.documentId,
        request.documentVersionId,
      );
    }

    if (totalPages === 0) {
      throw new EmptyExtractedDocumentException(request.documentId, request.documentVersionId, {
        reason: 'PDF contains zero renderable pages.',
      });
    }

    // 3. Detect Scanned / Image-only PDF vs Normal Digital Text PDF
    let totalExtractedChars = 0;
    const emptyPages: number[] = [];

    for (let p = 0; p < pagesText.length; p++) {
      const pageText = pagesText[p] ?? '';
      const cleanLen = pageText.trim().length;
      totalExtractedChars += cleanLen;
      if (cleanLen === 0) {
        emptyPages.push(p + 1);
      }
    }

    // Explicit Scanned PDF Detection (OCR_REQUIRED)
    if (totalExtractedChars === 0 && totalPages > 0) {
      throw new UnsupportedDocumentFeatureException(
        'Document appears to be a scanned or image-only PDF with zero digital text streams (OCR_REQUIRED). Optical Character Recognition is required.',
        request.documentId,
        request.documentVersionId,
      );
    }

    const maxExtractedChars = 5 * 1024 * 1024;
    if (totalExtractedChars > maxExtractedChars) {
      throw new ExtractionResourceLimitExceededException(
        'Extracted text characters',
        totalExtractedChars,
        maxExtractedChars,
        request.documentId,
        request.documentVersionId,
      );
    }

    // 4. Construct ExtractedBlock stream preserving 1-indexed page boundaries
    const blocks: ExtractedBlock[] = [];
    let sequenceCounter = 0;

    for (let pageIdx = 0; pageIdx < pagesText.length; pageIdx++) {
      const pageNumber = pageIdx + 1;
      const rawPageText = pagesText[pageIdx] ?? '';

      // Page boundary marker
      blocks.push(
        ExtractedBlock.create({
          type: ExtractedBlockType.PAGE_BOUNDARY,
          text: `--- Page ${pageNumber} ---`,
          sequence: sequenceCounter++,
          pageNumber,
          metadata: { pageIndex: pageIdx, isSynthetic: true },
        }),
      );

      // Split page content into semantic paragraph blocks
      const paragraphs = rawPageText
        .split(/\r?\n\r?\n/)
        .map((p: string) => p.trim())
        .filter((p: string) => p.length > 0);

      for (const para of paragraphs) {
        // Detect possible headings on page (short line, title-like, no trailing period)
        const isHeadingCandidate =
          para.length <= 80 &&
          !para.endsWith('.') &&
          !para.endsWith(';') &&
          !para.includes('\n') &&
          (/^[A-Z0-9\sÁÉÍÓÚÑ¿¡:.-]+$/.test(para) || /^[A-ZÁÉÍÓÚÑ]/.test(para));

        if (isHeadingCandidate && para.length < 60) {
          blocks.push(
            ExtractedBlock.create({
              type: ExtractedBlockType.HEADING,
              text: para,
              sequence: sequenceCounter++,
              headingLevel: 2,
              pageNumber,
            }),
          );
        } else {
          blocks.push(
            ExtractedBlock.create({
              type: ExtractedBlockType.PARAGRAPH,
              text: para,
              sequence: sequenceCounter++,
              pageNumber,
            }),
          );
        }
      }
    }

    const durationMs = Date.now() - startTime;
    const warnings: string[] = [];
    if (emptyPages.length > 0) {
      warnings.push(
        `Pages without digital text streams: [${emptyPages.join(', ')}]. Content on these pages may be bitmap images.`,
      );
    }

    return ExtractedDocument.create({
      documentId: request.documentId,
      documentVersionId: request.documentVersionId,
      sourceFormat: DocumentFormat.PDF,
      title: request.originalFileName?.replace(/\.pdf$/i, '') ?? null,
      languageHint: request.languageHint ?? 'es',
      blocks,
      metadata: {
        parserName: this.parserName,
        parserVersion: '2.2.1',
        pageCount: totalPages,
        totalChars: totalExtractedChars,
        warningCount: warnings.length,
        warnings,
        custom: {
          executionDurationMs: durationMs,
          emptyPages,
          readingOrderNotice:
            'Extracted from PDF content stream in sequential object order. Multi-column or irregular layouts may require visual layout verification.',
        },
      },
      extractedAt: new Date(),
    });
  }
}
