import { Command } from '../../shared/command.interface';

/** Input payload for AddAppointmentNoteCommand */
export interface AddAppointmentNoteCommandInput {
  readonly appointmentId: string;
  readonly authorId: string;
  readonly noteText: string;
  readonly expectedVersion: number;
}

/**
 * CQRS Command payload to append an operational note to an appointment.
 */
export class AddAppointmentNoteCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;
  public readonly input: AddAppointmentNoteCommandInput;

  constructor(
    input: AddAppointmentNoteCommandInput,
    commandId?: string,
    timestamp: Date = new Date(),
  ) {
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
