import { Command } from '../shared/command.interface';

export interface StartTreatmentSessionInput {
  readonly sessionId: string;
}

/**
 * CQRS Command to transition a SCHEDULED TreatmentSession to IN_PROGRESS.
 */
export class StartTreatmentSessionCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly input: StartTreatmentSessionInput,
    commandId?: string,
    timestamp: Date = new Date(),
  ) {
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}
