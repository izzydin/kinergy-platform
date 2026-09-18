/**
 * Interface contract for Sales CQRS Command Handlers.
 */
export interface SalesCommandHandler<TCommand, TResult> {
  execute(command: TCommand): Promise<TResult>;
}
