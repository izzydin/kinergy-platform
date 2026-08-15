import { Command } from '../../shared/command.interface';

/** Input payload for CreateAppointmentCommand */
export interface CreateAppointmentCommandInput {
  readonly id?: string;
  readonly clientId: string;
  readonly therapistId: string;
  readonly roomId: string;
  readonly type: string;
  readonly startTime: string;
  readonly endTime?: string;
  readonly requestToken?: string;
  readonly requiredCapacity?: number;
  readonly requiredFeatures?: string[];
}

/**
 * CQRS Command payload to book a new appointment.
 */
export class CreateAppointmentCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;
  public readonly input: CreateAppointmentCommandInput;

  constructor(
    input: CreateAppointmentCommandInput,
    commandId?: string,
    timestamp: Date = new Date(),
  ) {
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
