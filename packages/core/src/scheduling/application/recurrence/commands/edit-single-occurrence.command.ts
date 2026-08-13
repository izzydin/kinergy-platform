import { Command } from '../../shared/command.interface';

export interface EditSingleOccurrenceInput {
  readonly appointmentId: string;
  readonly startTime?: string | Date;
  readonly endTime?: string | Date;
  readonly therapistId?: string;
  readonly roomId?: string;
  readonly notes?: string;
  readonly reason?: string;
}

export class EditSingleOccurrenceCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;
  public readonly input: EditSingleOccurrenceInput;

  constructor(input: EditSingleOccurrenceInput, commandId?: string, timestamp: Date = new Date()) {
    if (!input.appointmentId || input.appointmentId.trim().length === 0) {
      throw new Error('appointmentId is required for EditSingleOccurrenceCommand.');
    }
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
