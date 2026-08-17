/**
 * Base interface for all CQRS Application Commands in Kinesiology.
 */
export interface Command {
  readonly commandId: string;
  readonly timestamp: Date;
}
