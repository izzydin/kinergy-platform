import {
  DocumentExtractionException,
  UnsupportedFormatExtractionException,
  InvalidFormatExtractionException,
  CorruptDocumentExtractionException,
  EmptyExtractedDocumentException,
  ExtractionTimeoutException,
  ExtractionResourceLimitExceededException,
  UnsupportedDocumentFeatureException,
  ParserInternalException,
  SourceObjectUnavailableException,
  ExtractionCancelledException,
  isExtractionRetryable,
  classifyExtractionError,
} from '../exceptions/document-extraction.exceptions';
import { ExtractionErrorCode } from '../enums/extraction-error-code.enum';

describe('Document Extraction Exceptions & Error Model', () => {
  it('correctly classifies retryable vs non-retryable domain exceptions', () => {
    const timeout = new ExtractionTimeoutException(30000, 'doc-1', 'ver-1');
    expect(timeout instanceof DocumentExtractionException).toBe(true);
    expect(timeout.isRetryable).toBe(true);
    expect(timeout.code).toBe(ExtractionErrorCode.EXTRACTION_TIMEOUT);
    expect(isExtractionRetryable(timeout)).toBe(true);

    const sourceUnavailable = new SourceObjectUnavailableException('key-1', 'doc-1', 'ver-1', true);
    expect(sourceUnavailable.isRetryable).toBe(true);
    expect(sourceUnavailable.code).toBe(ExtractionErrorCode.SOURCE_OBJECT_UNAVAILABLE);
    expect(isExtractionRetryable(sourceUnavailable)).toBe(true);

    const parserInternalRetryable = new ParserInternalException('segfault', 'doc-1', 'ver-1', true);
    expect(parserInternalRetryable.isRetryable).toBe(true);
    expect(isExtractionRetryable(parserInternalRetryable)).toBe(true);

    const unsupported = new UnsupportedFormatExtractionException('video/mp4');
    expect(unsupported.isRetryable).toBe(false);
    expect(unsupported.code).toBe(ExtractionErrorCode.UNSUPPORTED_FORMAT);
    expect(isExtractionRetryable(unsupported)).toBe(false);

    const corrupt = new CorruptDocumentExtractionException('Truncated PDF header');
    expect(corrupt.isRetryable).toBe(false);
    expect(corrupt.code).toBe(ExtractionErrorCode.CORRUPT_DOCUMENT);
    expect(isExtractionRetryable(corrupt)).toBe(false);

    const empty = new EmptyExtractedDocumentException('doc-1', 'ver-1');
    expect(empty.isRetryable).toBe(false);
    expect(empty.code).toBe(ExtractionErrorCode.EMPTY_DOCUMENT);
    expect(isExtractionRetryable(empty)).toBe(false);

    const cancelled = new ExtractionCancelledException('User aborted');
    expect(cancelled.isRetryable).toBe(false);
    expect(cancelled.code).toBe(ExtractionErrorCode.CANCELLATION);
    expect(isExtractionRetryable(cancelled)).toBe(false);

    const feature = new UnsupportedDocumentFeatureException('Password Protected');
    expect(feature.isRetryable).toBe(false);
    expect(feature.code).toBe(ExtractionErrorCode.UNSUPPORTED_FEATURE);
    expect(isExtractionRetryable(feature)).toBe(false);

    const resource = new ExtractionResourceLimitExceededException('Max Chunks', 3000, 2000);
    expect(resource.isRetryable).toBe(false);
    expect(resource.code).toBe(ExtractionErrorCode.RESOURCE_LIMIT_EXCEEDED);
    expect(isExtractionRetryable(resource)).toBe(false);
  });

  it('classifies raw runtime/third-party errors deterministically with classifyExtractionError', () => {
    const rawTimeout = new Error('Connection timed out while parsing');
    const c1 = classifyExtractionError(rawTimeout);
    expect(c1.code).toBe(ExtractionErrorCode.EXTRACTION_TIMEOUT);
    expect(c1.isRetryable).toBe(true);

    const rawEncrypted = new Error('PDF has encrypted streams with unknown password');
    const c2 = classifyExtractionError(rawEncrypted);
    expect(c2.code).toBe(ExtractionErrorCode.UNSUPPORTED_FEATURE);
    expect(c2.isRetryable).toBe(false);

    const rawScanned = new Error('Document appears to be scanned; OCR required');
    const c3 = classifyExtractionError(rawScanned);
    expect(c3.code).toBe(ExtractionErrorCode.UNSUPPORTED_FEATURE);
    expect(c3.isRetryable).toBe(false);

    const rawCorrupt = new Error('Corrupted xref table at byte 4096');
    const c4 = classifyExtractionError(rawCorrupt);
    expect(c4.code).toBe(ExtractionErrorCode.CORRUPT_DOCUMENT);
    expect(c4.isRetryable).toBe(false);

    const rawUnknown = new Error('Unknown memory access exception');
    const c5 = classifyExtractionError(rawUnknown);
    expect(c5.code).toBe(ExtractionErrorCode.PARSER_INTERNAL_ERROR);
    expect(c5.isRetryable).toBe(true);
  });

  it('preserves existing DocumentExtractionException attributes when passed to classifyExtractionError', () => {
    const original = new InvalidFormatExtractionException('Invalid XML in DOCX', 'doc-1', 'ver-1');
    const classified = classifyExtractionError(original);

    expect(classified.code).toBe(ExtractionErrorCode.INVALID_FORMAT);
    expect(classified.isRetryable).toBe(false);
    expect(classified.message).toContain('Invalid XML in DOCX');
  });
});
