import { DocumentValidationException } from '../exceptions/knowledge-document.exceptions';
import { DocumentChecksum } from '../value-objects/document-checksum.vo';
import { isSupportedMimeType } from '../enums/document-format.enum';

export interface CreateDocumentVersionProps {
  id?: string;
  documentId: string;
  versionNumber: number;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  checksum: DocumentChecksum | string;
  storageKey: string;
  language?: string;
  uploadedBy: string;
  createdAt?: Date;
}

/**
 * Immutable entity representing a specific physical file version of a Knowledge Document.
 * Once created, its binary attributes, cryptographic checksum, and storage location can never be mutated.
 */
export class DocumentVersion {
  public readonly id: string;
  public readonly documentId: string;
  public readonly versionNumber: number;
  public readonly originalFileName: string;
  public readonly mimeType: string;
  public readonly fileSize: number;
  public readonly checksum: string;
  public readonly storageKey: string;
  public readonly language: string;
  public readonly uploadedBy: string;
  public readonly createdAt: Date;

  private constructor(props: {
    id: string;
    documentId: string;
    versionNumber: number;
    originalFileName: string;
    mimeType: string;
    fileSize: number;
    checksum: string;
    storageKey: string;
    language: string;
    uploadedBy: string;
    createdAt: Date;
  }) {
    this.id = props.id;
    this.documentId = props.documentId;
    this.versionNumber = props.versionNumber;
    this.originalFileName = props.originalFileName;
    this.mimeType = props.mimeType;
    this.fileSize = props.fileSize;
    this.checksum = props.checksum;
    this.storageKey = props.storageKey;
    this.language = props.language;
    this.uploadedBy = props.uploadedBy;
    this.createdAt = new Date(props.createdAt.getTime());
    Object.freeze(this);
  }

  public static create(props: CreateDocumentVersionProps): DocumentVersion {
    if (!props.documentId || props.documentId.trim() === '') {
      throw new DocumentValidationException('Parent documentId is required for DocumentVersion.');
    }
    if (!Number.isInteger(props.versionNumber) || props.versionNumber < 1) {
      throw new DocumentValidationException(
        `Version number must be a positive integer, received: ${props.versionNumber}`,
      );
    }
    if (!props.originalFileName || props.originalFileName.trim() === '') {
      throw new DocumentValidationException('Original file name cannot be empty.');
    }
    if (!props.mimeType || !isSupportedMimeType(props.mimeType)) {
      throw new DocumentValidationException(
        `Unsupported MIME type: '${props.mimeType}'. Supported: PDF, DOCX, Markdown, Text.`,
      );
    }
    if (typeof props.fileSize !== 'number' || props.fileSize <= 0) {
      throw new DocumentValidationException('File size must be a positive number of bytes.');
    }
    if (!props.storageKey || props.storageKey.trim() === '') {
      throw new DocumentValidationException('Storage key cannot be empty.');
    }
    if (!props.uploadedBy || props.uploadedBy.trim() === '') {
      throw new DocumentValidationException('Uploader identity is required for DocumentVersion.');
    }

    const checksumVal =
      props.checksum instanceof DocumentChecksum
        ? props.checksum.value
        : DocumentChecksum.create(props.checksum).value;

    const id =
      props.id && props.id.trim() !== ''
        ? props.id.trim()
        : typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID
          ? globalThis.crypto.randomUUID()
          : `ver_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    return new DocumentVersion({
      id,
      documentId: props.documentId.trim(),
      versionNumber: props.versionNumber,
      originalFileName: props.originalFileName.trim(),
      mimeType: props.mimeType.toLowerCase().trim(),
      fileSize: props.fileSize,
      checksum: checksumVal,
      storageKey: props.storageKey.trim(),
      language: props.language?.trim().toLowerCase() || 'es',
      uploadedBy: props.uploadedBy.trim(),
      createdAt: props.createdAt ? new Date(props.createdAt.getTime()) : new Date(),
    });
  }
}
