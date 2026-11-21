import { RetrievedChunk } from './retrieved-chunk.model';
import { ChunkId } from '../value-objects/chunk-id.vo';

export interface CreateRAGEvidenceChunkProps {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  documentVersionNumber: number;
  content: string;
  tokenCount: number;
  similarityScore: number;
  pageNumber?: number;
  headingPath?: readonly string[];
  sectionHierarchy?: readonly string[];
  retrievalStrategy: string;
  semanticRank?: number;
  semanticScore?: number;
  keywordRank?: number;
  keywordScore?: number;
  rrfRank?: number;
  rrfScore?: number;
  rerankerRank?: number;
  rerankerScore?: number;
}

/**
 * Domain Model encapsulating an authorized knowledge chunk formatted as evidence
 * for downstream prompt construction and citation attribution.
 *
 * Preserves exact document identity, versioning, page attribution, and multi-arm
 * retrieval scoring provenance without allowing the LLM to alter source facts.
 */
export class RAGEvidenceChunk {
  public readonly chunkId: string;
  public readonly documentId: string;
  public readonly documentTitle: string;
  public readonly documentVersionNumber: number;
  public readonly content: string;
  public readonly tokenCount: number;
  public readonly similarityScore: number;
  public readonly pageNumber?: number;
  public readonly headingPath?: readonly string[];
  public readonly sectionHierarchy?: readonly string[];
  public readonly retrievalStrategy: string;
  public readonly semanticRank?: number;
  public readonly semanticScore?: number;
  public readonly keywordRank?: number;
  public readonly keywordScore?: number;
  public readonly rrfRank?: number;
  public readonly rrfScore?: number;
  public readonly rerankerRank?: number;
  public readonly rerankerScore?: number;

  private constructor(props: CreateRAGEvidenceChunkProps) {
    this.chunkId = props.chunkId;
    this.documentId = props.documentId;
    this.documentTitle = props.documentTitle;
    this.documentVersionNumber = props.documentVersionNumber;
    this.content = props.content;
    this.tokenCount = props.tokenCount;
    this.similarityScore = props.similarityScore;
    this.pageNumber = props.pageNumber;
    this.headingPath = props.headingPath ? Object.freeze([...props.headingPath]) : undefined;
    this.sectionHierarchy = props.sectionHierarchy
      ? Object.freeze([...props.sectionHierarchy])
      : undefined;
    this.retrievalStrategy = props.retrievalStrategy;
    this.semanticRank = props.semanticRank;
    this.semanticScore = props.semanticScore;
    this.keywordRank = props.keywordRank;
    this.keywordScore = props.keywordScore;
    this.rrfRank = props.rrfRank;
    this.rrfScore = props.rrfScore;
    this.rerankerRank = props.rerankerRank;
    this.rerankerScore = props.rerankerScore;
    Object.freeze(this);
  }

  public static create(props: CreateRAGEvidenceChunkProps): RAGEvidenceChunk {
    if (!props.chunkId || typeof props.chunkId !== 'string') {
      throw new Error('RAGEvidenceChunk requires a valid string chunkId.');
    }
    if (!props.documentId || typeof props.documentId !== 'string') {
      throw new Error('RAGEvidenceChunk requires a valid string documentId.');
    }
    if (!props.content || typeof props.content !== 'string' || props.content.trim().length === 0) {
      throw new Error('RAGEvidenceChunk content cannot be empty.');
    }
    return new RAGEvidenceChunk(props);
  }

  /**
   * Hydrates a RAGEvidenceChunk directly from an authorized domain RetrievedChunk.
   * Extracts multi-arm ranking telemetry from metadata when present.
   */
  public static fromRetrievedChunk(
    chunk: RetrievedChunk,
    rank?: number,
    strategy = 'HYBRID',
  ): RAGEvidenceChunk {
    const chunkIdStr =
      chunk.chunkId instanceof ChunkId ? chunk.chunkId.value : String(chunk.chunkId);
    const meta = chunk.metadata ?? {};

    const semanticRank =
      typeof meta.semanticRank === 'number'
        ? meta.semanticRank
        : typeof meta.originSemanticRank === 'number'
          ? meta.originSemanticRank
          : undefined;

    const semanticScore = typeof meta.semanticScore === 'number' ? meta.semanticScore : undefined;

    const keywordRank =
      typeof meta.lexicalRank === 'number'
        ? meta.lexicalRank
        : typeof meta.originLexicalRank === 'number'
          ? meta.originLexicalRank
          : undefined;

    const keywordScore = typeof meta.lexicalScore === 'number' ? meta.lexicalScore : undefined;

    const rrfRank = typeof meta.rrfRank === 'number' ? meta.rrfRank : rank;
    const rrfScore = typeof meta.rrfScore === 'number' ? meta.rrfScore : undefined;

    const rerankerRank = typeof meta.rerankedRank === 'number' ? meta.rerankedRank : undefined;
    const rerankerScore = typeof meta.rerankedScore === 'number' ? meta.rerankedScore : undefined;

    const resolvedStrategy =
      typeof meta.strategy === 'string'
        ? meta.strategy
        : Array.isArray(meta.candidateSources)
          ? (meta.candidateSources as string[]).join('+').toUpperCase()
          : strategy;

    return new RAGEvidenceChunk({
      chunkId: chunkIdStr,
      documentId: chunk.documentId,
      documentTitle: chunk.provenance?.documentTitle ?? 'Untitled Document',
      documentVersionNumber: chunk.provenance?.documentVersionNumber ?? 1,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      similarityScore: chunk.similarity.value,
      pageNumber: chunk.provenance?.pageNumber,
      headingPath: chunk.provenance?.headingPath,
      sectionHierarchy: chunk.provenance?.sectionHierarchy,
      retrievalStrategy: resolvedStrategy,
      semanticRank,
      semanticScore,
      keywordRank,
      keywordScore,
      rrfRank,
      rrfScore,
      rerankerRank,
      rerankerScore,
    });
  }
}
