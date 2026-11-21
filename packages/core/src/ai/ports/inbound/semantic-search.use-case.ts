import { VisibilityScope } from '../../domain/enums/visibility-scope.enum';
import { RetrievalSearchMode } from '../../domain/enums/retrieval-search-mode.enum';
import { RetrievalResult } from '../../domain/models/retrieval-result.model';
import { SemanticRetrievalResponse } from '../../domain/models/retrieval-response.model';

export const SEMANTIC_SEARCH_USE_CASE_PORT = Symbol('ISemanticSearchUseCase');

/**
 * Authoritative security context resolved from authenticated session or JWT.
 * Never trusted from unauthenticated client input.
 */
export interface RetrievalAuthContext {
  readonly tenantId: string;
  readonly userId: string;
  readonly roles: readonly string[];
  readonly allowedVisibilityScopes: readonly VisibilityScope[];
}

/**
 * Input command for the Semantic Search Use Case.
 */
export interface SemanticSearchCommand {
  readonly query: string;
  readonly authContext: RetrievalAuthContext;
  readonly topK?: number;
  readonly minSimilarity?: number;
  readonly documentIds?: string[];
  readonly mimeTypes?: string[];
  readonly filterMetadata?: Record<string, unknown>;
  readonly searchMode?: RetrievalSearchMode;
  readonly signal?: AbortSignal;
  readonly requestId?: string;
  readonly correlationId?: string;
}

/**
 * Observability telemetry emitted after each semantic search execution.
 */
export interface RetrievalTelemetry {
  readonly tenantId: string;
  readonly queryLength: number;
  readonly topKRequested: number;
  readonly chunksReturned: number;
  readonly totalMatchesFound: number;
  readonly totalDurationMs: number;
  readonly embeddingDurationMs: number;
  readonly vectorSearchDurationMs: number;
  readonly activeGenerationId: string;
  readonly profileId: string;
  readonly topSimilarityScore?: number;
}

/**
 * Inbound Use Case Port for Semantic Search.
 * Pure application boundary contract.
 */
export interface ISemanticSearchUseCase {
  execute(command: SemanticSearchCommand): Promise<RetrievalResult>;
  executeAndFormat?(command: SemanticSearchCommand): Promise<SemanticRetrievalResponse>;
}
