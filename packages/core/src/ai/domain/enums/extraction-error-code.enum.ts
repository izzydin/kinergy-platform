/**
 * Standardized error codes for document extraction and parsing operations.
 */
export enum ExtractionErrorCode {
  /**
   * The requested MIME type or document format is not supported by any registered parser.
   */
  UNSUPPORTED_FORMAT = 'EXTRACTION_UNSUPPORTED_FORMAT',

  /**
   * The document does not conform to the expected format specification or magic bytes.
   */
  INVALID_FORMAT = 'EXTRACTION_INVALID_FORMAT',

  /**
   * The document binary payload is corrupted, truncated, or unreadable.
   */
  CORRUPT_DOCUMENT = 'EXTRACTION_CORRUPT_DOCUMENT',

  /**
   * The document was parsed successfully but yielded zero extractable text or structural blocks.
   */
  EMPTY_DOCUMENT = 'EXTRACTION_EMPTY_DOCUMENT',

  /**
   * Document extraction exceeded the configured execution time limit.
   */
  EXTRACTION_TIMEOUT = 'EXTRACTION_TIMEOUT',

  /**
   * Document exceeded size, entry, or memory allocation constraints during extraction.
   */
  RESOURCE_LIMIT_EXCEEDED = 'EXTRACTION_RESOURCE_LIMIT_EXCEEDED',

  /**
   * The document contains unsupported capabilities (e.g. password encryption, scanned bitmap without OCR, form macros).
   */
  UNSUPPORTED_FEATURE = 'EXTRACTION_UNSUPPORTED_FEATURE',

  /**
   * Unhandled exception thrown by the underlying parser implementation.
   */
  PARSER_INTERNAL_ERROR = 'EXTRACTION_PARSER_INTERNAL_ERROR',

  /**
   * The source object could not be retrieved from backing storage.
   */
  SOURCE_OBJECT_UNAVAILABLE = 'EXTRACTION_SOURCE_OBJECT_UNAVAILABLE',

  /**
   * The extraction operation was explicitly aborted or cancelled.
   */
  CANCELLATION = 'EXTRACTION_CANCELLED',
}
