import { Command } from '../shared/command.interface';

export interface MarkTreatmentSessionNoShowInput {
  readonly sessionId: string;
}

/**
 * CQRS Command to transition a TreatmentSession from SCHEDULED to NO_SHOW.
 */
export class MarkTreatmentSessionNoShowCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly input: MarkTreatmentSessionNoShowInput,
    commandId?: string,
    timestamp: Date = new Date(),
  ) {
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}
