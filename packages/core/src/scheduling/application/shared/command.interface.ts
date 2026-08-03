/**
 * Base interface for all CQRS Application Commands.
 */
export interface Command {
  readonly commandId: string;
  readonly timestamp: Date;
}
