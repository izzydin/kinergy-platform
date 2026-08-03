import { Command } from '../../shared/command.interface';

/** Input payload for UpdateAppointmentCommand */
export interface UpdateAppointmentCommandInput {
  readonly appointmentId: string;
  readonly expectedVersion: number;
  readonly newTimeRange?: {
    readonly startTime: string;
    readonly endTime: string;
  };
  readonly newTherapistId?: string;
  readonly newRoomId?: string;
}

/**
 * CQRS Command payload to update an existing appointment's schedule, therapist, or room.
 */
export class UpdateAppointmentCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;
  public readonly input: UpdateAppointmentCommandInput;

  constructor(
    input: UpdateAppointmentCommandInput,
    commandId?: string,
    timestamp: Date = new Date(),
  ) {
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
