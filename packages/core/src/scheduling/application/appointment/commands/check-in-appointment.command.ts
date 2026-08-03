import { Command } from '../../shared/command.interface';

/** Input payload for CheckInAppointmentCommand */
export interface CheckInAppointmentCommandInput {
  readonly appointmentId: string;
  readonly expectedVersion: number;
}

/**
 * CQRS Command payload to check in a client upon arrival at the clinic.
 */
export class CheckInAppointmentCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;
  public readonly input: CheckInAppointmentCommandInput;

  constructor(
    input: CheckInAppointmentCommandInput,
    commandId?: string,
    timestamp: Date = new Date(),
  ) {
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
