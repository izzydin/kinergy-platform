import { DocumentFormat } from '../../domain/enums/document-format.enum';
import { ExtractedDocument } from '../../domain/models/extracted-document.model';

export const DOCUMENT_PARSER_PORT = Symbol('DOCUMENT_PARSER_PORT');

/**
 * Input request payload for document extraction.
 */
export interface ParseDocumentRequest {
  readonly tenantId: string;
  readonly documentId: string;
  readonly documentVersionId: string;
  readonly format: DocumentFormat;
  readonly buffer: Uint8Array;
  readonly originalFileName?: string;
  readonly languageHint?: string;
  readonly maxSizeBytes?: number;
}

/**
 * Outcome of preflight format validation and feature compatibility analysis.
 */
export interface FormatCompatibilityResult {
  readonly isCompatible: boolean;
  readonly format: DocumentFormat;
  readonly detectedMimeType?: string;
  readonly rejectionReason?: string;
  readonly unsupportedFeatures?: readonly string[];
}

/**
 * Diagnostic metrics returned alongside parsed document content.
 */
export interface ParserExtractionMetadata {
  readonly parserName: string;
  readonly parserVersion: string;
  readonly executionDurationMs: number;
  readonly pageCount?: number | null;
  readonly warnings?: readonly string[];
}

/**
 * Outbound port contract for document parsing and structural text extraction.
 * In accordance with Hexagonal Architecture:
 * - Core domain depends on this contract.
 * - Framework-independent, zero third-party parser types exposed.
 * - Supports preflight validation, format checking, and structured extraction.
 */
export interface IDocumentParserPort {
  /**
   * Unique identifier of this parser implementation (e.g. 'unpdf-parser', 'mammoth-docx-parser').
   */
  readonly parserName: string;

  /**
   * Determines whether this parser supports the given document format.
   */
  supportsFormat(format: DocumentFormat): boolean;

  /**
   * Validates whether the provided buffer is compatible and readable by this parser
   * before initiating full parsing (e.g. checking for encryption or corrupted structures).
   */
  validateCompatibility(
    buffer: Uint8Array,
    format: DocumentFormat,
  ): Promise<FormatCompatibilityResult>;

  /**
   * Parses the binary document buffer into a structured, provenance-preserving ExtractedDocument.
   * Throws classified DocumentExtractionException on parser or format failure.
   */
  parse(request: ParseDocumentRequest): Promise<ExtractedDocument>;
}
