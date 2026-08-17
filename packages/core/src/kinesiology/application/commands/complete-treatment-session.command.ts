import { Command } from '../shared/command.interface';

export interface CompleteTreatmentSessionInput {
  readonly sessionId: string;
}

/**
 * CQRS Command to mark an in-progress TreatmentSession as COMPLETED.
 */
export class CompleteTreatmentSessionCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly input: CompleteTreatmentSessionInput,
    commandId?: string,
    timestamp: Date = new Date(),
  ) {
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}
