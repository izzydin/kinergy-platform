import { Injectable, Logger, Optional } from '@nestjs/common';
import * as mammoth from 'mammoth';
import {
  IDocumentParserPort,
  ParseDocumentRequest,
  FormatCompatibilityResult,
  DocumentFormat,
  ExtractedDocument,
  ExtractedBlock,
  ExtractedBlockType,
  InvalidFormatExtractionException,
  CorruptDocumentExtractionException,
  EmptyExtractedDocumentException,
  UnsupportedDocumentFeatureException,
  ExtractionTimeoutException,
  ExtractionResourceLimitExceededException,
  classifyExtractionError,
} from '@kinergy-platform/core';

export interface DocxParserOptions {
  maxSizeBytes?: number;
  timeoutMs?: number;
  maxUncompressedBytes?: number;
  maxEntryCount?: number;
}

const DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds
const MAX_DOCX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_DOCX_ENTRY_COUNT = 1000;

/**
 * Concrete DOCX parser adapter implementing IDocumentParserPort using Mammoth.
 * Preserves Word heading hierarchies, list items, and tabular structures,
 * defends against ZIP bombs and embedded macros, and enforces unpaginated provenance.
 */
@Injectable()
export class DocxParserAdapter implements IDocumentParserPort {
  public readonly parserName = 'mammoth-docx-parser';
  private readonly logger = new Logger(DocxParserAdapter.name);

  constructor(@Optional() private readonly options: DocxParserOptions = {}) {}

  public supportsFormat(format: DocumentFormat): boolean {
    return format === DocumentFormat.DOCX;
  }

  public async validateCompatibility(
    buffer: Uint8Array,
    format: DocumentFormat,
  ): Promise<FormatCompatibilityResult> {
    if (format !== DocumentFormat.DOCX) {
      return {
        isCompatible: false,
        format,
        rejectionReason: `Format '${format}' is not supported by DocxParserAdapter.`,
      };
    }

    const maxBytes = this.options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
    if (buffer.length > maxBytes) {
      return {
        isCompatible: false,
        format,
        rejectionReason: `DOCX size (${buffer.length} bytes) exceeds limit of ${maxBytes} bytes.`,
      };
    }

    const nodeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

    // Verify ZIP magic bytes (PK\x03\x04)
    if (nodeBuffer.length < 4 || nodeBuffer[0] !== 0x50 || nodeBuffer[1] !== 0x4b) {
      return {
        isCompatible: false,
        format,
        rejectionReason: 'Not a valid ZIP/OpenXML container.',
      };
    }

    try {
      this.assertSafeZipArchive(nodeBuffer);
    } catch (err: unknown) {
      const unsupported =
        err instanceof UnsupportedDocumentFeatureException ? ['VBA_MACROS'] : undefined;
      return {
        isCompatible: false,
        format,
        rejectionReason: err instanceof Error ? err.message : String(err),
        unsupportedFeatures: unsupported,
      };
    }

    return {
      isCompatible: true,
      format,
      detectedMimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
  }

  public async parse(request: ParseDocumentRequest): Promise<ExtractedDocument> {
    const startTime = Date.now();
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBytes = request.maxSizeBytes ?? this.options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;

    if (request.buffer.length > maxBytes) {
      throw new ExtractionResourceLimitExceededException(
        'DOCX buffer size',
        request.buffer.length,
        maxBytes,
        request.documentId,
        request.documentVersionId,
      );
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
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
        error instanceof UnsupportedDocumentFeatureException ||
        error instanceof InvalidFormatExtractionException ||
        error instanceof EmptyExtractedDocumentException ||
        error instanceof CorruptDocumentExtractionException
      ) {
        throw error;
      }

      const classified = classifyExtractionError(
        error,
        request.documentId,
        request.documentVersionId,
      );
      this.logger.error(
        `DOCX extraction failure on doc '${request.documentId}' v'${request.documentVersionId}': ${classified.message}`,
      );

      throw new InvalidFormatExtractionException(
        classified.message,
        request.documentId,
        request.documentVersionId,
      );
    }
  }

  private async executeExtraction(
    request: ParseDocumentRequest,
    startTime: number,
  ): Promise<ExtractedDocument> {
    const nodeBuffer = Buffer.isBuffer(request.buffer)
      ? request.buffer
      : Buffer.from(request.buffer);

    // 1. Verify ZIP archive structure & ZIP bomb defense
    this.assertSafeZipArchive(nodeBuffer, request.documentId, request.documentVersionId);

    // 2. Extract structured HTML via Mammoth (preserves tables and lists without loss)
    let htmlResult: { value: string; messages: { type: string; message: string }[] };

    try {
      htmlResult = await mammoth.convertToHtml({ buffer: nodeBuffer });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new InvalidFormatExtractionException(
        `Mammoth failed to decompress or parse DOCX OpenXML: ${msg}`,
        request.documentId,
        request.documentVersionId,
      );
    }

    const rawHtml = htmlResult.value?.trim() ?? '';
    if (rawHtml.length === 0) {
      throw new EmptyExtractedDocumentException(request.documentId, request.documentVersionId, {
        reason: 'DOCX document yielded zero textual content.',
      });
    }

    // 3. Tokenize semantic HTML into discrete domain blocks
    const { blocks, detectedTitle } = this.parseHtmlToBlocks(rawHtml);

    if (blocks.length === 0) {
      throw new EmptyExtractedDocumentException(request.documentId, request.documentVersionId, {
        reason: 'No structural blocks could be constructed from DOCX content.',
      });
    }

    const durationMs = Date.now() - startTime;
    const warnings = htmlResult.messages?.map((m) => `[Mammoth ${m.type}]: ${m.message}`) ?? [];

    return ExtractedDocument.create({
      documentId: request.documentId,
      documentVersionId: request.documentVersionId,
      sourceFormat: DocumentFormat.DOCX,
      title: detectedTitle ?? request.originalFileName?.replace(/\.docx$/i, '') ?? null,
      languageHint: request.languageHint ?? 'es',
      blocks,
      metadata: {
        parserName: this.parserName,
        parserVersion: '1.13.0',
        pageCount: null, // Unpaginated
        totalChars: blocks.reduce((acc, b) => acc + b.charCount, 0),
        warningCount: warnings.length,
        warnings,
        custom: {
          executionDurationMs: durationMs,
          mammothMessageCount: htmlResult.messages?.length ?? 0,
        },
      },
      extractedAt: new Date(),
    });
  }

  private parseHtmlToBlocks(html: string): {
    blocks: ExtractedBlock[];
    detectedTitle: string | null;
  } {
    const cleanHtml = html.replace(/\r\n/g, '\n');
    const blocks: ExtractedBlock[] = [];
    let sequenceCounter = 0;
    const sectionPathStack: { level: number; text: string }[] = [];
    let detectedTitle: string | null = null;

    // Match top-level blocks: h1-h6, p, table, ul, ol, blockquote, pre
    const tagRegex = /<(h[1-6]|p|table|ul|ol|blockquote|pre)[\s\S]*?<\/\1>/gi;
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(cleanHtml)) !== null) {
      const rawTag = (match[1] ?? '').toLowerCase();
      const fullBlock = match[0] ?? '';

      if (/^h[1-6]$/.test(rawTag)) {
        const level = parseInt(rawTag[1] ?? '1', 10);
        const text = fullBlock.replace(/<[^>]+>/g, '').trim();
        if (!text) continue;

        while (
          sectionPathStack.length > 0 &&
          (sectionPathStack[sectionPathStack.length - 1]?.level ?? 0) >= level
        ) {
          sectionPathStack.pop();
        }

        const currentSectionPath = sectionPathStack.map((s) => s.text);
        sectionPathStack.push({ level, text });

        if (!detectedTitle && level === 1) {
          detectedTitle = text;
        }

        blocks.push(
          ExtractedBlock.create({
            type: ExtractedBlockType.HEADING,
            text,
            sequence: sequenceCounter++,
            headingLevel: level,
            sectionPath: currentSectionPath,
            pageNumber: null,
          }),
        );
      } else if (rawTag === 'p') {
        const text = fullBlock.replace(/<[^>]+>/g, '').trim();
        if (!text) continue;
        const currentSectionPath = sectionPathStack.map((s) => s.text);

        const bulletMatch = text.match(/^[•\-*]\s*(.+)$/);
        const numberedMatch = text.match(/^(\d+)[.)]\s*(.+)$/);

        if (bulletMatch && bulletMatch[1]) {
          blocks.push(
            ExtractedBlock.create({
              type: ExtractedBlockType.LIST_ITEM,
              text: bulletMatch[1].trim(),
              sequence: sequenceCounter++,
              sectionPath: currentSectionPath,
              pageNumber: null,
              metadata: { ordered: false },
            }),
          );
        } else if (numberedMatch && numberedMatch[2]) {
          blocks.push(
            ExtractedBlock.create({
              type: ExtractedBlockType.LIST_ITEM,
              text: numberedMatch[2].trim(),
              sequence: sequenceCounter++,
              sectionPath: currentSectionPath,
              pageNumber: null,
              metadata: { ordered: true, index: parseInt(numberedMatch[1] ?? '1', 10) },
            }),
          );
        } else {
          blocks.push(
            ExtractedBlock.create({
              type: ExtractedBlockType.PARAGRAPH,
              text,
              sequence: sequenceCounter++,
              sectionPath: currentSectionPath,
              pageNumber: null,
            }),
          );
        }
      } else if (rawTag === 'table') {
        const rowMatches = [...fullBlock.matchAll(/<tr[\s\S]*?<\/tr>/gi)];
        const rows: string[][] = [];
        for (const rm of rowMatches) {
          const cellMatches = [...rm[0].matchAll(/<t[dh][\s\S]*?<\/t[dh]>/gi)];
          const cells = cellMatches.map((c) => c[0].replace(/<[^>]+>/g, '').trim());
          if (cells.length > 0) rows.push(cells);
        }

        if (rows.length > 0) {
          const maxCols = Math.max(...rows.map((r) => r.length));
          const normalizedRows = rows.map((r) => {
            const copy = [...r];
            while (copy.length < maxCols) copy.push('');
            return copy;
          });
          const header = normalizedRows[0] ?? [];
          const dataRows = normalizedRows.slice(1);
          const headerLine = `| ${header.join(' | ')} |`;
          const sepLine = `| ${header.map(() => '---').join(' | ')} |`;
          const dataLines = dataRows.map((r) => `| ${r.join(' | ')} |`);
          const tableFormattedText = [headerLine, sepLine, ...dataLines].join('\n');
          const currentSectionPath = sectionPathStack.map((s) => s.text);

          blocks.push(
            ExtractedBlock.create({
              type: ExtractedBlockType.TABLE,
              text: tableFormattedText,
              sequence: sequenceCounter++,
              sectionPath: currentSectionPath,
              pageNumber: null,
              tableMetadata: {
                rowCount: rows.length,
                colCount: maxCols,
                headers: header,
              },
            }),
          );
        }
      } else if (rawTag === 'ul' || rawTag === 'ol') {
        const liMatches = [...fullBlock.matchAll(/<li[\s\S]*?<\/li>/gi)];
        const currentSectionPath = sectionPathStack.map((s) => s.text);
        const isOrdered = rawTag === 'ol';
        for (const li of liMatches) {
          const text = li[0].replace(/<[^>]+>/g, '').trim();
          if (text) {
            blocks.push(
              ExtractedBlock.create({
                type: ExtractedBlockType.LIST_ITEM,
                text,
                sequence: sequenceCounter++,
                sectionPath: currentSectionPath,
                pageNumber: null,
                metadata: { ordered: isOrdered },
              }),
            );
          }
        }
      } else if (rawTag === 'blockquote') {
        const text = fullBlock.replace(/<[^>]+>/g, '').trim();
        if (text) {
          blocks.push(
            ExtractedBlock.create({
              type: ExtractedBlockType.BLOCKQUOTE,
              text,
              sequence: sequenceCounter++,
              sectionPath: sectionPathStack.map((s) => s.text),
              pageNumber: null,
            }),
          );
        }
      } else if (rawTag === 'pre') {
        const text = fullBlock.replace(/<[^>]+>/g, '').trim();
        if (text) {
          blocks.push(
            ExtractedBlock.create({
              type: ExtractedBlockType.CODE_BLOCK,
              text,
              sequence: sequenceCounter++,
              sectionPath: sectionPathStack.map((s) => s.text),
              pageNumber: null,
            }),
          );
        }
      }
    }

    return { blocks, detectedTitle };
  }

  /**
   * Performs in-memory ZIP central directory validation to protect against ZIP bombs and malicious macros.
   */
  private assertSafeZipArchive(
    buffer: Buffer,
    documentId?: string,
    documentVersionId?: string,
  ): void {
    // 1. Locate End of Central Directory (EOCD: 0x06054b50)
    let eocdOffset = -1;
    const searchStart = Math.max(0, buffer.length - 65557);
    for (let i = buffer.length - 22; i >= searchStart; i--) {
      if (buffer.readUInt32LE(i) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset === -1) {
      throw new InvalidFormatExtractionException(
        'Invalid DOCX file: End of Central Directory record not found in ZIP archive.',
        documentId,
        documentVersionId,
      );
    }

    const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
    const maxEntries = this.options.maxEntryCount ?? MAX_DOCX_ENTRY_COUNT;

    if (totalEntries > maxEntries) {
      throw new ExtractionResourceLimitExceededException(
        'DOCX archive entry count',
        totalEntries,
        maxEntries,
        documentId,
        documentVersionId,
      );
    }

    const cdSize = buffer.readUInt32LE(eocdOffset + 12);
    const cdOffset = buffer.readUInt32LE(eocdOffset + 16);

    if (cdOffset + cdSize > buffer.length || cdOffset < 0) {
      throw new InvalidFormatExtractionException(
        'Corrupted DOCX archive: Central Directory offset out of bounds.',
        documentId,
        documentVersionId,
      );
    }

    let currentOffset = cdOffset;
    let accumulatedUncompressedSize = 0;
    const maxUncompressed = this.options.maxUncompressedBytes ?? MAX_DOCX_UNCOMPRESSED_BYTES;
    let hasContentTypes = false;
    let hasWordDocument = false;

    for (let i = 0; i < totalEntries; i++) {
      if (currentOffset + 46 > buffer.length) break;

      const signature = buffer.readUInt32LE(currentOffset);
      if (signature !== 0x02014b50) break; // Central directory file header signature

      const compressedSize = buffer.readUInt32LE(currentOffset + 20);
      const uncompressedSize = buffer.readUInt32LE(currentOffset + 24);
      const nameLength = buffer.readUInt16LE(currentOffset + 28);
      const extraLength = buffer.readUInt16LE(currentOffset + 30);
      const commentLength = buffer.readUInt16LE(currentOffset + 32);

      accumulatedUncompressedSize += uncompressedSize;

      // Zip bomb ratio defense
      if (compressedSize > 0 && uncompressedSize / compressedSize > 100) {
        throw new ExtractionResourceLimitExceededException(
          'DOCX compression ratio (ZIP bomb defense)',
          Math.round(uncompressedSize / compressedSize),
          100,
          documentId,
          documentVersionId,
        );
      }

      if (accumulatedUncompressedSize > maxUncompressed) {
        throw new ExtractionResourceLimitExceededException(
          'DOCX decompressed size (ZIP bomb defense)',
          accumulatedUncompressedSize,
          maxUncompressed,
          documentId,
          documentVersionId,
        );
      }

      const fileName = buffer.toString('utf8', currentOffset + 46, currentOffset + 46 + nameLength);

      // Macro check
      if (
        fileName.includes('vbaProject.bin') ||
        fileName.endsWith('.vba') ||
        fileName.includes('macros')
      ) {
        throw new UnsupportedDocumentFeatureException(
          `DOCX contains embedded executable macros or VBA project: '${fileName}'`,
          documentId,
          documentVersionId,
        );
      }

      if (fileName === '[Content_Types].xml') hasContentTypes = true;
      if (fileName === 'word/document.xml') hasWordDocument = true;

      currentOffset += 46 + nameLength + extraLength + commentLength;
    }

    if (!hasContentTypes || !hasWordDocument) {
      throw new CorruptDocumentExtractionException(
        'Invalid DOCX OpenXML structure: missing required [Content_Types].xml or word/document.xml.',
        documentId,
        documentVersionId,
      );
    }
  }
}
