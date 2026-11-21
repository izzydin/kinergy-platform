import { RAGEvidenceChunk } from '../models/rag-evidence-chunk.model';

export interface CreateRAGSourceCitationProps {
  documentId: string;
  documentTitle: string;
  chunkId: string;
  pageNumber?: number;
  headingPath?: readonly string[];
  relevanceScore: number;
  sourceStrategy?: string;
}

/**
 * Value Object encapsulating a verifiable source citation tied to a retrieved evidence chunk.
 */
export class RAGSourceCitation {
  public readonly documentId: string;
  public readonly documentTitle: string;
  public readonly chunkId: string;
  public readonly pageNumber?: number;
  public readonly headingPath?: readonly string[];
  public readonly relevanceScore: number;
  public readonly sourceStrategy?: string;

  private constructor(props: CreateRAGSourceCitationProps) {
    this.documentId = props.documentId;
    this.documentTitle = props.documentTitle;
    this.chunkId = props.chunkId;
    this.pageNumber = props.pageNumber;
    this.headingPath = props.headingPath ? Object.freeze([...props.headingPath]) : undefined;
    this.relevanceScore = Math.max(0.0, Math.min(1.0, props.relevanceScore));
    this.sourceStrategy = props.sourceStrategy;
    Object.freeze(this);
  }

  public static create(props: CreateRAGSourceCitationProps): RAGSourceCitation {
    if (!props.documentId || typeof props.documentId !== 'string') {
      throw new Error('RAGSourceCitation requires a valid documentId.');
    }
    if (!props.documentTitle || typeof props.documentTitle !== 'string') {
      throw new Error('RAGSourceCitation requires a valid documentTitle.');
    }
    if (!props.chunkId || typeof props.chunkId !== 'string') {
      throw new Error('RAGSourceCitation requires a valid chunkId.');
    }
    return new RAGSourceCitation(props);
  }

  public static fromEvidenceChunk(chunk: RAGEvidenceChunk): RAGSourceCitation {
    return new RAGSourceCitation({
      documentId: chunk.documentId,
      documentTitle: chunk.documentTitle,
      chunkId: chunk.chunkId,
      pageNumber: chunk.pageNumber,
      headingPath: chunk.headingPath,
      relevanceScore: chunk.similarityScore,
      sourceStrategy: chunk.retrievalStrategy,
    });
  }
}
