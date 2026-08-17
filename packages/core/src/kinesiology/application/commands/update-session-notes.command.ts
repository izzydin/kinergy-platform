import { Command } from '../shared/command.interface';
import { SessionNotesProps } from '../../domain/treatment-session/session-notes.vo';

export interface UpdateSessionNotesInput {
  sessionId: string;
  notes: SessionNotesProps | string;
}

/**
 * CQRS Command for charting or updating clinical progress notes on an active TreatmentSession.
 */
export class UpdateSessionNotesCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;

  constructor(
    public readonly input: UpdateSessionNotesInput,
    commandId?: string,
    timestamp: Date = new Date(),
  ) {
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}
