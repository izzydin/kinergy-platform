import { RAGEvidenceChunk } from '../models/rag-evidence-chunk.model';

export interface CreateRAGSourceCitationProps {
  documentId: string;
  documentTitle: string;
  chunkId: string;
  documentVersionId?: string;
  documentVersionNumber?: number;
  excerpt?: string;
  pageNumber?: number;
  headingPath?: readonly string[];
  relevanceScore: number;
  retrievalRank?: number;
  sourceStrategy?: string;
}

/**
 * Value Object encapsulating a verifiable source citation tied to a retrieved evidence chunk.
 */
export class RAGSourceCitation {
  public readonly documentId: string;
  public readonly documentTitle: string;
  public readonly chunkId: string;
  public readonly documentVersionId?: string;
  public readonly documentVersionNumber?: number;
  public readonly excerpt?: string;
  public readonly pageNumber?: number;
  public readonly headingPath?: readonly string[];
  public readonly relevanceScore: number;
  public readonly retrievalRank?: number;
  public readonly sourceStrategy?: string;

  private constructor(props: CreateRAGSourceCitationProps) {
    this.documentId = props.documentId;
    this.documentTitle = props.documentTitle;
    this.chunkId = props.chunkId;
    this.documentVersionId = props.documentVersionId;
    this.documentVersionNumber = props.documentVersionNumber;
    this.excerpt = props.excerpt;
    this.pageNumber = props.pageNumber;
    this.headingPath = props.headingPath ? Object.freeze([...props.headingPath]) : undefined;
    this.relevanceScore = Math.max(0.0, Math.min(1.0, props.relevanceScore));
    this.retrievalRank = props.retrievalRank;
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
      documentVersionNumber: chunk.documentVersionNumber,
      excerpt: chunk.content,
      pageNumber: chunk.pageNumber,
      headingPath: chunk.headingPath,
      relevanceScore: chunk.similarityScore,
      retrievalRank: chunk.semanticRank ?? chunk.rrfRank ?? chunk.keywordRank,
      sourceStrategy: chunk.retrievalStrategy,
    });
  }
}
