import { RetrievalResult } from './retrieval-result.model';

/**
 * Retrieved chunk formatted for client and agent response, strictly
 * decoupling domain/persistence models from client exposure.
 */
export interface RetrievedChunkResponse {
  /** The textual content of the retrieved chunk */
  readonly content: string;

  /** Numerical similarity score and distance metric */
  readonly similarity: {
    readonly score: number;
    readonly distance: number;
    readonly metric: 'cosine';
  };

  /** Detailed provenance lineage citing source document and exact location */
  readonly provenance: {
    readonly chunkId: string;
    readonly documentId: string;
    readonly documentTitle: string;
    readonly documentVersionId?: string;
    readonly documentVersionNumber: number;
    readonly originalFileName: string;
    readonly mimeType: string;
    readonly chunkSequence: number;
    readonly pageNumber?: number;
    readonly sectionHierarchy?: readonly string[];
    readonly sourceLocator?: string;
    readonly startChar?: number;
    readonly endChar?: number;
    readonly language: string;
  };

  /** Allowlisted metadata attached to the chunk */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Granular performance diagnostics for observability and SLA tracking.
 */
export interface RetrievalExecutionDiagnostics {
  /** Total elapsed time from request receipt to response completion (ms) */
  readonly totalDurationMs: number;

  /** Time spent generating the query embedding via Ollama/BGE-M3 (ms) */
  readonly embeddingDurationMs: number;

  /** Time spent executing vector similarity search in PostgreSQL/pgvector (ms) */
  readonly vectorSearchDurationMs: number;

  /** Time spent in security authorization, scoring, and threshold evaluation (ms) */
  readonly scoringAndFilteringDurationMs: number;

  /** Time spent mapping and assembling provenance (ms) */
  readonly provenanceMappingDurationMs: number;

  /** Active index generation ID used for the query */
  readonly activeGenerationId: string;

  /** Model profile used for retrieval (e.g. 'bge-m3-dense-v1') */
  readonly modelProfile: string;

  /** Vector dimensions (1024) */
  readonly dimensions: number;
}

/**
 * High-level retrieval metadata returned to clients and auditors.
 */
export interface RetrievalMetadataResponse {
  /** Tenant ID associated with the query */
  readonly tenantId: string;

  /** Requested top-K limit */
  readonly requestedTopK: number;

  /** Actual count of chunks returned */
  readonly returnedCount: number;

  /** Total matching chunks in index meeting criteria before top-K truncation */
  readonly totalMatchesFound: number;

  /** Minimum similarity threshold applied */
  readonly similarityThreshold: number;

  /** Search mode utilized (e.g. 'SEMANTIC') */
  readonly searchMode: string;

  /** Categories of filters applied (e.g. ['mimeTypes', 'metadataFilter']) */
  readonly filterCategoriesApplied: readonly string[];
}

export interface SemanticRetrievalResponseOptions {
  readonly requestId?: string;
  readonly modelProfile?: string;
  readonly dimensions?: number;
  readonly scoringAndFilteringDurationMs?: number;
  readonly provenanceMappingDurationMs?: number;
}

/**
 * Production Response Contract for Semantic Retrieval.
 * Strictly separates:
 * 1. Retrieved content
 * 2. Similarity score
 * 3. Source provenance
 * 4. Retrieval metadata
 * 5. Execution diagnostics
 */
export class SemanticRetrievalResponse {
  public readonly requestId: string;
  public readonly chunks: readonly RetrievedChunkResponse[];
  public readonly metadata: RetrievalMetadataResponse;
  public readonly diagnostics: RetrievalExecutionDiagnostics;

  private constructor(props: {
    requestId: string;
    chunks: readonly RetrievedChunkResponse[];
    metadata: RetrievalMetadataResponse;
    diagnostics: RetrievalExecutionDiagnostics;
  }) {
    this.requestId = props.requestId;
    this.chunks = Object.freeze([...props.chunks]);
    this.metadata = Object.freeze(props.metadata);
    this.diagnostics = Object.freeze(props.diagnostics);
    Object.freeze(this);
  }

  public static fromResult(
    result: RetrievalResult,
    options?: SemanticRetrievalResponseOptions,
  ): SemanticRetrievalResponse {
    const provStart = performance.now();
    const requestId =
      options?.requestId || `ret_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    const filterCategories: string[] = [];
    if (result.query.criteria.documentIds && result.query.criteria.documentIds.length > 0) {
      filterCategories.push('documentIds');
    }
    if (
      result.query.criteria.allowedVisibilityScopes &&
      result.query.criteria.allowedVisibilityScopes.length > 0
    ) {
      filterCategories.push('visibilityScope');
    }
    if (result.query.criteria.mimeTypes && result.query.criteria.mimeTypes.length > 0) {
      filterCategories.push('mimeTypes');
    }
    if (
      result.query.criteria.metadataFilter &&
      Object.keys(result.query.criteria.metadataFilter).length > 0
    ) {
      filterCategories.push('metadataFilter');
    }
    if (result.query.criteria.createdFrom || result.query.criteria.createdTo) {
      filterCategories.push('dateRange');
    }

    const chunks: RetrievedChunkResponse[] = result.chunks.map((chunk) => ({
      content: chunk.content,
      similarity: {
        score: chunk.similarity.value,
        distance: chunk.distance,
        metric: 'cosine' as const,
      },
      provenance: {
        chunkId: chunk.provenance.chunkId || chunk.chunkId.value,
        documentId: chunk.provenance.documentId || chunk.documentId,
        documentTitle: chunk.provenance.documentTitle,
        documentVersionId: chunk.provenance.documentVersionId || chunk.documentVersionId,
        documentVersionNumber: chunk.provenance.documentVersionNumber,
        originalFileName: chunk.provenance.originalFileName,
        mimeType: chunk.provenance.mimeType,
        chunkSequence: chunk.provenance.chunkSequence,
        pageNumber: chunk.provenance.pageNumber,
        sectionHierarchy: chunk.provenance.sectionHierarchy ?? chunk.provenance.headingPath,
        sourceLocator: chunk.provenance.sourceLocator,
        startChar: chunk.provenance.startChar,
        endChar: chunk.provenance.endChar,
        language: chunk.provenance.language,
      },
      metadata: chunk.metadata,
    }));

    const provMappingMs = options?.provenanceMappingDurationMs ?? performance.now() - provStart;

    const embMs = result.embeddingDurationMs ?? 0;
    const searchMs = result.searchDurationMs ?? 0;
    const scoringMs =
      options?.scoringAndFilteringDurationMs ??
      Math.max(0, result.executionDurationMs - embMs - searchMs - provMappingMs);

    return new SemanticRetrievalResponse({
      requestId,
      chunks,
      metadata: {
        tenantId: result.query.criteria.tenantId,
        requestedTopK: result.query.topK,
        returnedCount: chunks.length,
        totalMatchesFound: result.totalMatches,
        similarityThreshold: result.query.minSimilarity ? result.query.minSimilarity.value : 0.0,
        searchMode: 'SEMANTIC',
        filterCategoriesApplied: Object.freeze(filterCategories),
      },
      diagnostics: {
        totalDurationMs: result.executionDurationMs,
        embeddingDurationMs: embMs,
        vectorSearchDurationMs: searchMs,
        scoringAndFilteringDurationMs: scoringMs,
        provenanceMappingDurationMs: provMappingMs,
        activeGenerationId: result.activeGenerationId,
        modelProfile: options?.modelProfile || 'bge-m3-dense-v1',
        dimensions: options?.dimensions || 1024,
      },
    });
  }
}
