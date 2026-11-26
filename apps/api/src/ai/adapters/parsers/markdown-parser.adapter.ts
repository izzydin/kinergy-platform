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
  ExtractionTimeoutException,
  ExtractionResourceLimitExceededException,
  classifyExtractionError,
} from '@kinergy-platform/core';

export interface MarkdownParserOptions {
  maxSizeBytes?: number;
  timeoutMs?: number;
}

const DEFAULT_MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

let cachedMarked: typeof import('marked').marked | null = null;

async function getMarked(): Promise<typeof import('marked').marked> {
  if (!cachedMarked) {
    const dynamicImport = new Function('s', 'return import(s)') as (s: string) => Promise<{
      marked: typeof import('marked').marked;
    }>;
    const mod = await dynamicImport('marked');
    cachedMarked = mod.marked;
  }
  return cachedMarked;
}

/**
 * Concrete Markdown parser adapter implementing IDocumentParserPort using marked.lexer.
 * Extracts structured AST tokens without rendering HTML, preserves code blocks,
 * table structures, and heading hierarchies, and guarantees unpaginated provenance.
 */
@Injectable()
export class MarkdownParserAdapter implements IDocumentParserPort {
  public readonly parserName = 'marked-markdown-parser';
  private readonly logger = new Logger(MarkdownParserAdapter.name);

  constructor(@Optional() private readonly options: MarkdownParserOptions = {}) {}

  public supportsFormat(format: DocumentFormat): boolean {
    return format === DocumentFormat.MARKDOWN;
  }

  public async validateCompatibility(
    buffer: Uint8Array,
    format: DocumentFormat,
  ): Promise<FormatCompatibilityResult> {
    if (format !== DocumentFormat.MARKDOWN) {
      return {
        isCompatible: false,
        format,
        rejectionReason: `Format '${format}' is not supported by MarkdownParserAdapter.`,
      };
    }

    const maxBytes = this.options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;
    if (buffer.length > maxBytes) {
      return {
        isCompatible: false,
        format,
        rejectionReason: `Markdown file size (${buffer.length} bytes) exceeds limit of ${maxBytes} bytes.`,
      };
    }

    const nodeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);

    // Check for null bytes (binary protection)
    if (nodeBuffer.includes(0x00)) {
      return {
        isCompatible: false,
        format,
        rejectionReason: 'Binary control bytes (null bytes) detected in Markdown file.',
      };
    }

    return {
      isCompatible: true,
      format,
      detectedMimeType: 'text/markdown',
    };
  }

  public async parse(request: ParseDocumentRequest): Promise<ExtractedDocument> {
    const startTime = Date.now();
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const maxBytes = request.maxSizeBytes ?? this.options.maxSizeBytes ?? DEFAULT_MAX_SIZE_BYTES;

    if (request.buffer.length > maxBytes) {
      throw new ExtractionResourceLimitExceededException(
        'Markdown buffer size',
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
        `Markdown extraction failure on doc '${request.documentId}' v'${request.documentVersionId}': ${classified.message}`,
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

    // 1. Binary check
    if (nodeBuffer.includes(0x00)) {
      throw new InvalidFormatExtractionException(
        'Binary null bytes detected. File is not a valid UTF-8 text/markdown document.',
        request.documentId,
        request.documentVersionId,
      );
    }

    // 2. Decode UTF-8 (handling BOM)
    let rawText: string;
    try {
      let sliceStart = 0;
      if (
        nodeBuffer.length >= 3 &&
        nodeBuffer[0] === 0xef &&
        nodeBuffer[1] === 0xbb &&
        nodeBuffer[2] === 0xbf
      ) {
        sliceStart = 3;
      }
      const decoder = new TextDecoder('utf-8', { fatal: true });
      rawText = decoder.decode(nodeBuffer.subarray(sliceStart));
    } catch {
      throw new InvalidFormatExtractionException(
        'Malformed UTF-8 byte sequences encountered in Markdown file.',
        request.documentId,
        request.documentVersionId,
      );
    }

    const cleanText = rawText.trim();
    if (cleanText.length === 0) {
      throw new EmptyExtractedDocumentException(request.documentId, request.documentVersionId, {
        reason: 'Markdown document is empty.',
      });
    }

    // 3. Tokenize AST using marked.lexer (safe against HTML/script execution)
    const marked = await getMarked();
    const tokens = marked.lexer(cleanText);

    const blocks: ExtractedBlock[] = [];
    let sequenceCounter = 0;
    const sectionPathStack: { level: number; text: string }[] = [];
    let detectedTitle: string | null = null;

    for (const token of tokens) {
      switch (token.type) {
        case 'heading': {
          const level = Math.min(Math.max(token.depth, 1), 6);
          const headingText = token.text.trim();

          while (
            sectionPathStack.length > 0 &&
            (sectionPathStack[sectionPathStack.length - 1]?.level ?? 0) >= level
          ) {
            sectionPathStack.pop();
          }

          const currentSectionPath = sectionPathStack.map((s) => s.text);
          sectionPathStack.push({ level, text: headingText });

          if (!detectedTitle && level === 1) {
            detectedTitle = headingText;
          }

          blocks.push(
            ExtractedBlock.create({
              type: ExtractedBlockType.HEADING,
              text: headingText,
              sequence: sequenceCounter++,
              headingLevel: level,
              sectionPath: currentSectionPath,
              pageNumber: null, // Unpaginated format
            }),
          );
          break;
        }

        case 'paragraph': {
          const sanitizedText = this.sanitizeMarkdownText(token.text);
          if (sanitizedText.length > 0) {
            blocks.push(
              ExtractedBlock.create({
                type: ExtractedBlockType.PARAGRAPH,
                text: sanitizedText,
                sequence: sequenceCounter++,
                sectionPath: sectionPathStack.map((s) => s.text),
                pageNumber: null,
              }),
            );
          }
          break;
        }

        case 'list': {
          for (const item of token.items) {
            const itemText = this.sanitizeMarkdownText(item.text);
            if (itemText.length > 0) {
              blocks.push(
                ExtractedBlock.create({
                  type: ExtractedBlockType.LIST_ITEM,
                  text: itemText,
                  sequence: sequenceCounter++,
                  sectionPath: sectionPathStack.map((s) => s.text),
                  pageNumber: null,
                  metadata: { ordered: token.ordered },
                }),
              );
            }
          }
          break;
        }

        case 'table': {
          const headers = token.header.map((h: { text: string }) =>
            this.sanitizeMarkdownText(h.text),
          );
          const rows = token.rows.map((row: Array<{ text: string }>) =>
            row.map((cell: { text: string }) => this.sanitizeMarkdownText(cell.text)),
          );

          const headerLine = `| ${headers.join(' | ')} |`;
          const sepLine = `| ${headers.map(() => '---').join(' | ')} |`;
          const rowLines = rows.map((r: string[]) => `| ${r.join(' | ')} |`);
          const tableFormattedText = [headerLine, sepLine, ...rowLines].join('\n');

          blocks.push(
            ExtractedBlock.create({
              type: ExtractedBlockType.TABLE,
              text: tableFormattedText,
              sequence: sequenceCounter++,
              sectionPath: sectionPathStack.map((s) => s.text),
              pageNumber: null,
              tableMetadata: {
                rowCount: rows.length + 1,
                colCount: headers.length,
                headers,
              },
            }),
          );
          break;
        }

        case 'code': {
          // Code fences must not be discarded
          blocks.push(
            ExtractedBlock.create({
              type: ExtractedBlockType.CODE_BLOCK,
              text: token.text,
              sequence: sequenceCounter++,
              codeLanguage: token.lang || null,
              sectionPath: sectionPathStack.map((s) => s.text),
              pageNumber: null,
            }),
          );
          break;
        }

        case 'blockquote': {
          const bqText = this.sanitizeMarkdownText(token.text);
          if (bqText.length > 0) {
            blocks.push(
              ExtractedBlock.create({
                type: ExtractedBlockType.BLOCKQUOTE,
                text: bqText,
                sequence: sequenceCounter++,
                sectionPath: sectionPathStack.map((s) => s.text),
                pageNumber: null,
              }),
            );
          }
          break;
        }

        case 'hr': {
          blocks.push(
            ExtractedBlock.create({
              type: ExtractedBlockType.DIVIDER,
              text: '---',
              sequence: sequenceCounter++,
              sectionPath: sectionPathStack.map((s) => s.text),
              pageNumber: null,
            }),
          );
          break;
        }

        case 'html': {
          // Never execute or render HTML. Strip script/style tags and preserve meaningful text safely.
          const sanitized = token.text
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, '')
            .trim();

          if (sanitized.length > 0) {
            blocks.push(
              ExtractedBlock.create({
                type: ExtractedBlockType.PARAGRAPH,
                text: sanitized,
                sequence: sequenceCounter++,
                sectionPath: sectionPathStack.map((s) => s.text),
                pageNumber: null,
              }),
            );
          }
          break;
        }
      }
    }

    if (blocks.length === 0) {
      throw new EmptyExtractedDocumentException(request.documentId, request.documentVersionId, {
        reason: 'Zero structural blocks could be constructed from Markdown tokens.',
      });
    }

    const durationMs = Date.now() - startTime;

    return ExtractedDocument.create({
      documentId: request.documentId,
      documentVersionId: request.documentVersionId,
      sourceFormat: DocumentFormat.MARKDOWN,
      title: detectedTitle ?? request.originalFileName?.replace(/\.(md|markdown)$/i, '') ?? null,
      languageHint: request.languageHint ?? 'es',
      blocks,
      metadata: {
        parserName: this.parserName,
        parserVersion: '18.2.1',
        pageCount: null,
        totalChars: cleanText.length,
        custom: { executionDurationMs: durationMs },
      },
      extractedAt: new Date(),
    });
  }

  /**
   * Transforms raw markdown inline elements (e.g. [label](url)) into safe text with references,
   * and strips dangerous HTML tags.
   */
  private sanitizeMarkdownText(text: string): string {
    if (!text) return '';
    // Strip HTML tags (<script>, <iframe>, <style>, etc.)
    let cleaned = text.replace(/<[^>]*>/g, ' ');

    // Convert links: [Text](url) -> Text (url)
    cleaned = cleaned.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)');

    // Normalize spacing
    return cleaned.replace(/\s+/g, ' ').trim();
  }
}
