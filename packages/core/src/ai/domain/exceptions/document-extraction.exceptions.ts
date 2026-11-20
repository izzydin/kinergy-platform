import { AiDomainException } from './ai-provider.exceptions';
import { ExtractionErrorCode } from '../enums/extraction-error-code.enum';

/**
 * Base domain exception for all document extraction and parsing errors.
 * Preserves structured error taxonomy, retryability classification,
 * and document version lineage without leaking parser-specific internals.
 */
export class DocumentExtractionException extends AiDomainException {
  public readonly code: ExtractionErrorCode;
  public readonly isRetryable: boolean;
  public readonly documentId?: string;
  public readonly documentVersionId?: string;
  public readonly details?: Readonly<Record<string, unknown>>;

  constructor(props: {
    message: string;
    code: ExtractionErrorCode;
    isRetryable: boolean;
    documentId?: string;
    documentVersionId?: string;
    details?: Record<string, unknown>;
  }) {
    super(props.message, props.code);
    this.code = props.code;
    this.isRetryable = props.isRetryable;
    this.documentId = props.documentId;
    this.documentVersionId = props.documentVersionId;
    this.details = props.details ? Object.freeze({ ...props.details }) : undefined;
  }
}

export class UnsupportedFormatExtractionException extends DocumentExtractionException {
  constructor(format: string, documentId?: string, documentVersionId?: string) {
    super({
      message: `Document format '${format}' is unsupported for text extraction. Supported formats: PDF, DOCX, Markdown, Text.`,
      code: ExtractionErrorCode.UNSUPPORTED_FORMAT,
      isRetryable: false,
      documentId,
      documentVersionId,
      details: { format },
    });
  }
}

export class InvalidFormatExtractionException extends DocumentExtractionException {
  constructor(message: string, documentId?: string, documentVersionId?: string) {
    super({
      message: `Document structure is invalid or violates format specifications: ${message}`,
      code: ExtractionErrorCode.INVALID_FORMAT,
      isRetryable: false,
      documentId,
      documentVersionId,
    });
  }
}

export class CorruptDocumentExtractionException extends DocumentExtractionException {
  constructor(reason: string, documentId?: string, documentVersionId?: string) {
    super({
      message: `Document file is corrupt, truncated, or unreadable: ${reason}`,
      code: ExtractionErrorCode.CORRUPT_DOCUMENT,
      isRetryable: false,
      documentId,
      documentVersionId,
    });
  }
}

export class EmptyExtractedDocumentException extends DocumentExtractionException {
  constructor(documentId?: string, documentVersionId?: string, details?: Record<string, unknown>) {
    super({
      message:
        'Document was parsed successfully but yielded zero extractable text or structural elements.',
      code: ExtractionErrorCode.EMPTY_DOCUMENT,
      isRetryable: false,
      documentId,
      documentVersionId,
      details,
    });
  }
}

export class ExtractionTimeoutException extends DocumentExtractionException {
  constructor(timeoutMs: number, documentId?: string, documentVersionId?: string) {
    super({
      message: `Document extraction timed out after ${timeoutMs}ms.`,
      code: ExtractionErrorCode.EXTRACTION_TIMEOUT,
      isRetryable: true,
      documentId,
      documentVersionId,
      details: { timeoutMs },
    });
  }
}

export class ExtractionResourceLimitExceededException extends DocumentExtractionException {
  constructor(
    limitDescription: string,
    actualValue: number,
    limitValue: number,
    documentId?: string,
    documentVersionId?: string,
  ) {
    super({
      message: `Document exceeded extraction resource limit '${limitDescription}': actual ${actualValue}, limit ${limitValue}.`,
      code: ExtractionErrorCode.RESOURCE_LIMIT_EXCEEDED,
      isRetryable: false,
      documentId,
      documentVersionId,
      details: { limitDescription, actualValue, limitValue },
    });
  }
}

export class UnsupportedDocumentFeatureException extends DocumentExtractionException {
  constructor(feature: string, documentId?: string, documentVersionId?: string) {
    super({
      message: `Document contains an unsupported feature: ${feature}. (e.g. password encryption, scanned bitmap requiring OCR).`,
      code: ExtractionErrorCode.UNSUPPORTED_FEATURE,
      isRetryable: false,
      documentId,
      documentVersionId,
      details: { feature },
    });
  }
}

export class ParserInternalException extends DocumentExtractionException {
  constructor(
    internalMessage: string,
    documentId?: string,
    documentVersionId?: string,
    isRetryable = true,
  ) {
    super({
      message: `Parser encountered an unexpected internal error: ${internalMessage}`,
      code: ExtractionErrorCode.PARSER_INTERNAL_ERROR,
      isRetryable,
      documentId,
      documentVersionId,
    });
  }
}

export class SourceObjectUnavailableException extends DocumentExtractionException {
  constructor(
    storageKey: string,
    documentId?: string,
    documentVersionId?: string,
    isRetryable = true,
  ) {
    super({
      message: `Source binary object '${storageKey}' is temporarily or permanently unavailable.`,
      code: ExtractionErrorCode.SOURCE_OBJECT_UNAVAILABLE,
      isRetryable,
      documentId,
      documentVersionId,
      details: { storageKey },
    });
  }
}

export class ExtractionCancelledException extends DocumentExtractionException {
  constructor(reason?: string, documentId?: string, documentVersionId?: string) {
    const detail = reason ? `: ${reason}` : '.';
    super({
      message: `Document extraction was cancelled by user or tenant request${detail}`,
      code: ExtractionErrorCode.CANCELLATION,
      isRetryable: false,
      documentId,
      documentVersionId,
    });
  }
}

/**
 * Evaluates whether an extraction-related error is eligible for automated retry.
 */
export function isExtractionRetryable(error: unknown): boolean {
  if (error instanceof DocumentExtractionException) {
    return error.isRetryable;
  }
  return false;
}

/**
 * Standardizes any runtime or third-party parser error into the domain taxonomy.
 */
export function classifyExtractionError(
  error: unknown,
  _documentId?: string,
  _documentVersionId?: string,
): { code: ExtractionErrorCode; isRetryable: boolean; message: string } {
  if (error instanceof DocumentExtractionException) {
    return {
      code: error.code,
      isRetryable: error.isRetryable,
      message: error.message,
    };
  }

  const msg = error instanceof Error ? error.message : String(error);
  const lower = msg.toLowerCase();

  // Pattern detection for timeout/network
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return {
      code: ExtractionErrorCode.EXTRACTION_TIMEOUT,
      isRetryable: true,
      message: `Document extraction timed out: ${msg}`,
    };
  }

  // Encrypted / password-protected PDF
  if (
    lower.includes('password') ||
    lower.includes('encrypted') ||
    lower.includes('security handler')
  ) {
    return {
      code: ExtractionErrorCode.UNSUPPORTED_FEATURE,
      isRetryable: false,
      message: `Document is password-protected or encrypted: ${msg}`,
    };
  }

  // Scanned bitmap / no text stream
  if (lower.includes('scanned') || lower.includes('ocr required') || lower.includes('no font')) {
    return {
      code: ExtractionErrorCode.UNSUPPORTED_FEATURE,
      isRetryable: false,
      message: `Document appears to be scanned or contains no extractable text: ${msg}`,
    };
  }

  // Corrupt or truncated
  if (
    lower.includes('corrupt') ||
    lower.includes('truncated') ||
    lower.includes('unexpected eof') ||
    lower.includes('bad xref')
  ) {
    return {
      code: ExtractionErrorCode.CORRUPT_DOCUMENT,
      isRetryable: false,
      message: `Document file is corrupt or truncated: ${msg}`,
    };
  }

  // Fallback to internal error (retryable once by default)
  return {
    code: ExtractionErrorCode.PARSER_INTERNAL_ERROR,
    isRetryable: true,
    message: `Parser encountered an unclassified failure: ${msg}`,
  };
}
