/**
 * Interface contract for Sales CQRS Query Handlers.
 */
export interface SalesQueryHandler<TQuery, TResult> {
  execute(query: TQuery): Promise<TResult>;
}
