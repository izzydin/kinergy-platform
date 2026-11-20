import { DocumentValidationException } from '../exceptions/knowledge-document.exceptions';
import { DocumentChecksum } from './document-checksum.vo';

export interface ChunkProvenanceProps {
  documentId: string;
  documentVersionId: string;
  chunkIndex: number;
  pageNumber?: number | null;
  sectionHierarchy?: readonly string[];
  sourceBlockIds?: readonly string[];
  startOffset?: number | null;
  endOffset?: number | null;
  startLine?: number | null;
  endLine?: number | null;
  language?: string;
  checksum: DocumentChecksum | string;
  configurationVersion: string;
}

/**
 * Value Object representing the immutable provenance lineage of an individual chunk.
 * Preserves the exact relationship between the generated chunk and its source document,
 * specific document version, page references, structural sections, and source blocks.
 */
export class ChunkProvenance {
  public readonly documentId: string;
  public readonly documentVersionId: string;
  public readonly chunkIndex: number;
  public readonly pageNumber: number | null;
  public readonly sectionHierarchy: readonly string[];
  public readonly sourceBlockIds: readonly string[];
  public readonly startOffset: number | null;
  public readonly endOffset: number | null;
  public readonly startLine: number | null;
  public readonly endLine: number | null;
  public readonly language: string;
  public readonly checksum: string;
  public readonly configurationVersion: string;

  private constructor(props: {
    documentId: string;
    documentVersionId: string;
    chunkIndex: number;
    pageNumber: number | null;
    sectionHierarchy: readonly string[];
    sourceBlockIds: readonly string[];
    startOffset: number | null;
    endOffset: number | null;
    startLine: number | null;
    endLine: number | null;
    language: string;
    checksum: string;
    configurationVersion: string;
  }) {
    this.documentId = props.documentId;
    this.documentVersionId = props.documentVersionId;
    this.chunkIndex = props.chunkIndex;
    this.pageNumber = props.pageNumber;
    this.sectionHierarchy = Object.freeze([...props.sectionHierarchy]);
    this.sourceBlockIds = Object.freeze([...props.sourceBlockIds]);
    this.startOffset = props.startOffset;
    this.endOffset = props.endOffset;
    this.startLine = props.startLine;
    this.endLine = props.endLine;
    this.language = props.language;
    this.checksum = props.checksum;
    this.configurationVersion = props.configurationVersion;
    Object.freeze(this);
  }

  public static create(props: ChunkProvenanceProps): ChunkProvenance {
    if (!props.documentId || props.documentId.trim() === '') {
      throw new DocumentValidationException('ChunkProvenance requires a non-empty documentId.');
    }
    if (!props.documentVersionId || props.documentVersionId.trim() === '') {
      throw new DocumentValidationException(
        'ChunkProvenance requires a non-empty documentVersionId.',
      );
    }
    if (!Number.isInteger(props.chunkIndex) || props.chunkIndex < 0) {
      throw new DocumentValidationException(
        `Chunk index must be a non-negative integer, received: ${props.chunkIndex}`,
      );
    }
    if (!props.configurationVersion || props.configurationVersion.trim() === '') {
      throw new DocumentValidationException(
        'ChunkProvenance requires a non-empty configurationVersion.',
      );
    }

    const checksumVal =
      props.checksum instanceof DocumentChecksum
        ? props.checksum.value
        : DocumentChecksum.create(props.checksum).value;

    const pageNumber = props.pageNumber !== undefined ? props.pageNumber : null;
    if (pageNumber !== null && (!Number.isInteger(pageNumber) || pageNumber < 1)) {
      throw new DocumentValidationException(
        `Page number in provenance must be an integer >= 1, received: ${pageNumber}`,
      );
    }

    const startOffset = props.startOffset !== undefined ? props.startOffset : null;
    const endOffset = props.endOffset !== undefined ? props.endOffset : null;
    if (startOffset !== null && endOffset !== null && endOffset < startOffset) {
      throw new DocumentValidationException(
        `End offset (${endOffset}) cannot be less than start offset (${startOffset}) in provenance.`,
      );
    }

    const startLine = props.startLine !== undefined ? props.startLine : null;
    const endLine = props.endLine !== undefined ? props.endLine : null;
    if (startLine !== null && endLine !== null && endLine < startLine) {
      throw new DocumentValidationException(
        `End line (${endLine}) cannot be less than start line (${startLine}) in provenance.`,
      );
    }

    return new ChunkProvenance({
      documentId: props.documentId.trim(),
      documentVersionId: props.documentVersionId.trim(),
      chunkIndex: props.chunkIndex,
      pageNumber,
      sectionHierarchy: props.sectionHierarchy ? [...props.sectionHierarchy] : [],
      sourceBlockIds: props.sourceBlockIds ? [...props.sourceBlockIds] : [],
      startOffset,
      endOffset,
      startLine,
      endLine,
      language: (props.language || 'es').toLowerCase().trim(),
      checksum: checksumVal,
      configurationVersion: props.configurationVersion.trim(),
    });
  }
}
