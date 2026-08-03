import { Command } from '../../shared/command.interface';

/** Input payload for CompleteAppointmentCommand */
export interface CompleteAppointmentCommandInput {
  readonly appointmentId: string;
  readonly expectedVersion: number;
}

/**
 * CQRS Command payload to complete an appointment after therapy session conclusion.
 */
export class CompleteAppointmentCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;
  public readonly input: CompleteAppointmentCommandInput;

  constructor(
    input: CompleteAppointmentCommandInput,
    commandId?: string,
    timestamp: Date = new Date(),
  ) {
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
