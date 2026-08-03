import { Command } from '../../shared/command.interface';

/** Input payload for ConfirmAppointmentCommand */
export interface ConfirmAppointmentCommandInput {
  readonly appointmentId: string;
  readonly expectedVersion: number;
}

/**
 * CQRS Command payload to transition an appointment to CONFIRMED status.
 */
export class ConfirmAppointmentCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;
  public readonly input: ConfirmAppointmentCommandInput;

  constructor(
    input: ConfirmAppointmentCommandInput,
    commandId?: string,
    timestamp: Date = new Date(),
  ) {
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
