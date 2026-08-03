/**
 * Base interface for all CQRS Application Read Queries.
 */
export interface Query {
  readonly queryId: string;
  readonly timestamp: Date;
}
