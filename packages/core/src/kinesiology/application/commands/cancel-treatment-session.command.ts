import { Command } from '../shared/command.interface';

export interface CancelTreatmentSessionInput {
  readonly sessionId: string;
  readonly reason: string;
}

/**
 * CQRS Command to transition a TreatmentSession to CANCELLED with an explicit reason.
 */
export class CancelTreatmentSessionCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly input: CancelTreatmentSessionInput,
    commandId?: string,
    timestamp: Date = new Date(),
  ) {
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}
