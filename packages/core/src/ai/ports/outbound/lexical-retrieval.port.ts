import { RetrievalQuery } from '../../domain/value-objects/retrieval-query.vo';
import { RetrievedChunk } from '../../domain/models/retrieved-chunk.model';

export const LEXICAL_RETRIEVAL_PORT = Symbol('ILexicalRetrievalPort');

/**
 * Outbound Port defining the persistence boundary for authorized, tenant-isolated
 * lexical / full-text keyword retrieval.
 *
 * Keeps PostgreSQL text search (tsvector, websearch_to_tsquery, ts_rank) strictly encapsulated
 * within infrastructure persistence adapters.
 */
export interface ILexicalRetrievalPort {
  /**
   * Executes an authorized full-text search against indexed chunks and document titles,
   * applying PostgreSQL text search ranking and returning fully hydrated RetrievedChunks.
   *
   * Invariants:
   * - Must enforce `tenantId` in SQL before ranking and LIMIT.
   * - Must exclude soft-deleted documents (`deleted_at IS NULL`).
   * - Must filter by allowed `visibility_scope`s and requested `documentIds`.
   * - Must order by lexical rank DESC with deterministic tie-breaking on `id ASC`.
   * - Must enforce bounded `LIMIT topK`.
   */
  search(query: RetrievalQuery): Promise<RetrievedChunk[]>;

  /**
   * Returns the count of chunks meeting the search criteria and lexical query match.
   */
  countMatches(query: RetrievalQuery): Promise<number>;
}
