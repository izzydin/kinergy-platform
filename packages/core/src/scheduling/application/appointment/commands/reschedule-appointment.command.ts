import { Command } from '../../shared/command.interface';

/** Input payload for RescheduleAppointmentCommand */
export interface RescheduleAppointmentCommandInput {
  readonly appointmentId: string;
  readonly newStartTime: string;
  readonly newEndTime: string;
  readonly expectedVersion: number;
  readonly newRoomId?: string;
  readonly requiredCapacity?: number;
  readonly requiredFeatures?: string[];
}

/**
 * CQRS Command payload to reschedule an existing appointment to a new time range.
 */
export class RescheduleAppointmentCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;
  public readonly input: RescheduleAppointmentCommandInput;

  constructor(
    input: RescheduleAppointmentCommandInput,
    commandId?: string,
    timestamp: Date = new Date(),
  ) {
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
