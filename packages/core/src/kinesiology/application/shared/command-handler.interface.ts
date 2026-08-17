import { Command } from './command.interface';

/**
 * Interface contract for CQRS Command Handlers in Kinesiology.
 */
export interface CommandHandler<TCommand extends Command, TResult> {
  /**
   * Executes the command use case and returns the asynchronous result.
   */
  execute(command: TCommand): Promise<TResult>;
}
