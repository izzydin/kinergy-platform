import { Query } from './query.interface';

/**
 * Base interface for all CQRS Query Handlers in Kinesiology.
 */
export interface QueryHandler<TQuery extends Query, TResult> {
  execute(query: TQuery): Promise<TResult>;
}
