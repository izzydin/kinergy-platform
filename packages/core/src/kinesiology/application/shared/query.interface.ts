/**
 * Base interface for all CQRS Application Queries in Kinesiology.
 */
export interface Query {
  readonly queryId: string;
  readonly timestamp: Date;
}
