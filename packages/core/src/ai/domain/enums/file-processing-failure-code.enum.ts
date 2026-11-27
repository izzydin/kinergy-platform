/**
 * Stable, normalized failure categories for secure file upload,
 * validation, malware scanning, parsing, extraction, and RAG ingestion.
 *
 * Conforms to AI-10.3-08 Failure Classification.
 */
export enum FileProcessingFailureCode {
  /** Caller lacks required permissions or tenant clearance for upload. */
  UNAUTHORIZED_UPLOAD = 'UNAUTHORIZED_UPLOAD',

  /** Declared or detected file format is not permitted by file security policy. */
  UNSUPPORTED_FILE_TYPE = 'UNSUPPORTED_FILE_TYPE',

  /** File header magic bytes do not match declared extension or MIME type. */
  MIME_SIGNATURE_MISMATCH = 'MIME_SIGNATURE_MISMATCH',

  /** File size exceeds the maximum permitted ceiling (10 MB). */
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',

  /** Document binary payload is truncated, corrupt, or unreadable. */
  MALFORMED_DOCUMENT = 'MALFORMED_DOCUMENT',

  /** Antivirus or heuristic scanner detected malicious payload in document. */
  MALWARE_DETECTED = 'MALWARE_DETECTED',

  /** External or local malware scanning engine timed out or is unavailable. */
  SCAN_SERVICE_UNAVAILABLE = 'SCAN_SERVICE_UNAVAILABLE',

  /** DOCX/ZIP package violates archive integrity (null bytes, path traversal). */
  ARCHIVE_VALIDATION_FAILURE = 'ARCHIVE_VALIDATION_FAILURE',

  /** Archive expansion ratio, entry count, or uncompressed size exceeds limits. */
  RESOURCE_LIMIT_EXCEEDED = 'RESOURCE_LIMIT_EXCEEDED',

  /** Extraction or parsing execution exceeded configured wall-clock timeout. */
  PARSER_TIMEOUT = 'PARSER_TIMEOUT',

  /** Parser engine crashed or encountered an unhandled format exception. */
  PARSER_FAILURE = 'PARSER_FAILURE',

  /** Parser succeeded but yielded zero valid textual content or blocks. */
  EXTRACTION_FAILURE = 'EXTRACTION_FAILURE',

  /** Object storage upload, download, or existence check failed. */
  STORAGE_FAILURE = 'STORAGE_FAILURE',

  /** Scratch directory creation, writing, or ephemeral cleanup failed. */
  TEMP_FILE_FAILURE = 'TEMP_FILE_FAILURE',

  /** High-level ingestion orchestration or state transition failed. */
  INGESTION_ORCHESTRATION_FAILURE = 'INGESTION_ORCHESTRATION_FAILURE',
}
