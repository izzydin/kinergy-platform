import { Query } from './query.interface';

/**
 * Interface contract for CQRS Query Handlers.
 */
export interface QueryHandler<TQuery extends Query, TResult> {
  /**
   * Executes the read query use case and returns the asynchronous result.
   *
   * @param query Query payload
   */
  execute(query: TQuery): Promise<TResult>;
}
