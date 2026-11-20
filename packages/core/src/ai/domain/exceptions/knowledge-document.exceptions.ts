import { AiDomainException } from './ai-provider.exceptions';

export class InvalidStateTransitionException extends AiDomainException {
  constructor(fromState: string, toState: string, reason?: string) {
    const detail = reason ? ` Reason: ${reason}` : '';
    super(
      `Invalid lifecycle state transition from '${fromState}' to '${toState}'.${detail}`,
      'INVALID_STATE_TRANSITION',
    );
  }
}

export class DocumentNotFoundException extends AiDomainException {
  constructor(documentId: string) {
    super(`Knowledge document '${documentId}' was not found.`, 'DOCUMENT_NOT_FOUND');
  }
}

export class DocumentVersionConflictException extends AiDomainException {
  constructor(message: string) {
    super(message, 'VERSION_CONFLICT');
  }
}

export class DuplicateActiveIngestionException extends AiDomainException {
  constructor(documentVersionId: string) {
    super(
      `An active ingestion job already exists for document version '${documentVersionId}'.`,
      'DUPLICATE_ACTIVE_INGESTION',
    );
  }
}

export class DocumentAlreadyDeletedException extends AiDomainException {
  constructor(documentId: string) {
    super(
      `Knowledge document '${documentId}' is deleted and cannot be modified.`,
      'DOCUMENT_ALREADY_DELETED',
    );
  }
}

export class UnauthorizedDocumentAccessException extends AiDomainException {
  constructor(message = 'Unauthorized operation on knowledge document.') {
    super(message, 'UNAUTHORIZED_DOCUMENT_ACCESS');
  }
}

export class InvalidIngestionRetryException extends AiDomainException {
  constructor(message: string) {
    super(message, 'INVALID_INGESTION_RETRY');
  }
}

export class IngestionJobCancellationConflictException extends AiDomainException {
  constructor(message: string) {
    super(message, 'CANCELLATION_CONFLICT');
  }
}

export class DocumentValidationException extends AiDomainException {
  constructor(message: string, code = 'DOCUMENT_VALIDATION_ERROR') {
    super(message, code);
  }
}

export class UnsupportedDocumentFormatException extends DocumentValidationException {
  constructor(mimeTypeOrExt: string) {
    super(
      `Unsupported document format: '${mimeTypeOrExt}'. Supported formats: PDF, DOCX, Markdown, Plain Text.`,
      'UNSUPPORTED_DOCUMENT_FORMAT',
    );
  }
}

export class DocumentContentMismatchException extends DocumentValidationException {
  constructor(
    message = 'Document content does not match the declared MIME type or file extension.',
  ) {
    super(message, 'CONTENT_MISMATCH');
  }
}

export class DocumentMalformedException extends DocumentValidationException {
  constructor(message: string) {
    super(`Malformed document structure: ${message}`, 'DOCUMENT_MALFORMED');
  }
}

export class DocumentSizeLimitExceededException extends DocumentValidationException {
  constructor(actualSizeBytes: number, maxSizeBytes: number) {
    super(
      `File size (${actualSizeBytes} bytes) exceeds maximum permitted size of ${maxSizeBytes} bytes.`,
      'DOCUMENT_SIZE_EXCEEDED',
    );
  }
}

export class DocumentSecurityRiskException extends DocumentValidationException {
  constructor(reason: string) {
    super(`Security risk detected in document: ${reason}`, 'DOCUMENT_SECURITY_RISK');
  }
}

export class DuplicateDocumentVersionException extends AiDomainException {
  constructor(checksum: string, existingVersionNumber: number) {
    super(
      `A version with identical content checksum (${checksum}) already exists as version ${existingVersionNumber}.`,
      'DUPLICATE_DOCUMENT_VERSION',
    );
  }
}
