export interface CommandHandler<TCommand, TResult> {
  execute(command: TCommand): Promise<TResult>;
}
