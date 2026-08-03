import { Command } from './command.interface';

/**
 * Interface contract for CQRS Command Handlers.
 */
export interface CommandHandler<TCommand extends Command, TResult> {
  /**
   * Executes the command use case and returns the asynchronous result.
   *
   * @param command Command payload
   */
  execute(command: TCommand): Promise<TResult>;
}
