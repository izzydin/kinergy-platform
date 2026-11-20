import { Injectable, Logger } from '@nestjs/common';
import {
  IDocumentParserPort,
  ParseDocumentRequest,
  FormatCompatibilityResult,
  DocumentFormat,
  ExtractedDocument,
  UnsupportedFormatExtractionException,
  classifyExtractionError,
} from '@kinergy-platform/core';
import { PdfParserAdapter } from './pdf-parser.adapter';
import { DocxParserAdapter } from './docx-parser.adapter';
import { MarkdownParserAdapter } from './markdown-parser.adapter';
import { PlainTextParserAdapter } from './plain-text-parser.adapter';

/**
 * Composite Document Parser adapter implementing the unified IDocumentParserPort.
 * Routes parsing requests dynamically to the approved format-specific adapter
 * based on DocumentFormat, ensuring clean separation of concerns and OCP extensibility.
 */
@Injectable()
export class CompositeDocumentParserAdapter implements IDocumentParserPort {
  public readonly parserName = 'composite-document-parser';
  private readonly logger = new Logger(CompositeDocumentParserAdapter.name);
  private readonly adapters: IDocumentParserPort[];

  constructor(
    pdfAdapter?: PdfParserAdapter,
    docxAdapter?: DocxParserAdapter,
    markdownAdapter?: MarkdownParserAdapter,
    plainTextAdapter?: PlainTextParserAdapter,
  ) {
    this.adapters = [
      pdfAdapter ?? new PdfParserAdapter(),
      docxAdapter ?? new DocxParserAdapter(),
      markdownAdapter ?? new MarkdownParserAdapter(),
      plainTextAdapter ?? new PlainTextParserAdapter(),
    ];
  }

  public supportsFormat(format: DocumentFormat): boolean {
    return this.adapters.some((adapter) => adapter.supportsFormat(format));
  }

  public getSupportedFormats(): DocumentFormat[] {
    return [DocumentFormat.PDF, DocumentFormat.DOCX, DocumentFormat.MARKDOWN, DocumentFormat.TXT];
  }

  public async validateCompatibility(
    buffer: Uint8Array,
    format: DocumentFormat,
  ): Promise<FormatCompatibilityResult> {
    const adapter = this.adapters.find((a) => a.supportsFormat(format));
    if (!adapter) {
      return {
        isCompatible: false,
        format,
        rejectionReason: `No registered parser supports format '${format}'.`,
      };
    }
    return await adapter.validateCompatibility(buffer, format);
  }

  public async parse(request: ParseDocumentRequest): Promise<ExtractedDocument> {
    const adapter = this.adapters.find((a) => a.supportsFormat(request.format));
    if (!adapter) {
      throw new UnsupportedFormatExtractionException(
        request.format,
        request.documentId,
        request.documentVersionId,
      );
    }

    try {
      this.logger.log(
        `Dispatching document '${request.documentId}' v'${request.documentVersionId}' (${request.format}) to '${adapter.parserName}'.`,
      );
      return await adapter.parse(request);
    } catch (error: unknown) {
      const classified = classifyExtractionError(
        error,
        request.documentId,
        request.documentVersionId,
      );
      this.logger.warn(
        `Parser '${adapter.parserName}' failed for document '${request.documentId}' [${classified.code}]: ${classified.message}`,
      );
      throw error;
    }
  }
}
