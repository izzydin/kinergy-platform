export interface CreateRetrievalProvenanceProps {
  documentTitle: string;
  documentVersionNumber: number;
  originalFileName: string;
  mimeType: string;
  chunkSequence: number;
  chunkId?: string;
  documentId?: string;
  documentVersionId?: string;
  sourceLocator?: string;
  pageNumber?: number;
  startChar?: number;
  endChar?: number;
  headingPath?: string[];
  sectionHierarchy?: string[];
  language?: string;
}

/**
 * Value Object representing exact document and chunk-level lineage
 * returned alongside retrieved text chunks for auditability and UX citation.
 */
export class RetrievalProvenance {
  public readonly documentTitle: string;
  public readonly documentVersionNumber: number;
  public readonly originalFileName: string;
  public readonly mimeType: string;
  public readonly chunkSequence: number;
  public readonly chunkId?: string;
  public readonly documentId?: string;
  public readonly documentVersionId?: string;
  public readonly sourceLocator?: string;
  public readonly pageNumber?: number;
  public readonly startChar?: number;
  public readonly endChar?: number;
  public readonly headingPath?: readonly string[];
  public readonly sectionHierarchy?: readonly string[];
  public readonly language: string;

  private constructor(props: {
    documentTitle: string;
    documentVersionNumber: number;
    originalFileName: string;
    mimeType: string;
    chunkSequence: number;
    chunkId?: string;
    documentId?: string;
    documentVersionId?: string;
    sourceLocator?: string;
    pageNumber?: number;
    startChar?: number;
    endChar?: number;
    headingPath?: readonly string[];
    sectionHierarchy?: readonly string[];
    language: string;
  }) {
    this.documentTitle = props.documentTitle;
    this.documentVersionNumber = props.documentVersionNumber;
    this.originalFileName = props.originalFileName;
    this.mimeType = props.mimeType;
    this.chunkSequence = props.chunkSequence;
    this.chunkId = props.chunkId;
    this.documentId = props.documentId;
    this.documentVersionId = props.documentVersionId;
    this.sourceLocator = props.sourceLocator;
    this.pageNumber = props.pageNumber;
    this.startChar = props.startChar;
    this.endChar = props.endChar;
    this.headingPath = props.headingPath;
    this.sectionHierarchy = props.sectionHierarchy ?? props.headingPath;
    this.language = props.language;
    Object.freeze(this);
  }

  public static create(props: CreateRetrievalProvenanceProps): RetrievalProvenance {
    const rawHierarchy = props.sectionHierarchy ?? props.headingPath;
    const hierarchy = rawHierarchy ? Object.freeze([...rawHierarchy]) : undefined;

    return new RetrievalProvenance({
      documentTitle: (props.documentTitle || 'Untitled').trim(),
      documentVersionNumber: Math.max(1, props.documentVersionNumber || 1),
      originalFileName: (props.originalFileName || 'unknown').trim(),
      mimeType: (props.mimeType || 'text/plain').trim().toLowerCase(),
      chunkSequence: Math.max(0, props.chunkSequence ?? 0),
      chunkId: props.chunkId ? props.chunkId.trim() : undefined,
      documentId: props.documentId ? props.documentId.trim() : undefined,
      documentVersionId: props.documentVersionId ? props.documentVersionId.trim() : undefined,
      sourceLocator: props.sourceLocator ? props.sourceLocator.trim() : undefined,
      pageNumber:
        typeof props.pageNumber === 'number' &&
        Number.isFinite(props.pageNumber) &&
        props.pageNumber >= 1
          ? Math.floor(props.pageNumber)
          : undefined,
      startChar: props.startChar,
      endChar: props.endChar,
      headingPath: hierarchy,
      sectionHierarchy: hierarchy,
      language: (props.language || 'es').trim().toLowerCase(),
    });
  }
}
