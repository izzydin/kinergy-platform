import { Command } from '../../shared/command.interface';

/** Input payload for CancelAppointmentCommand */
export interface CancelAppointmentCommandInput {
  readonly appointmentId: string;
  readonly reason: string;
  readonly expectedVersion: number;
}

/**
 * CQRS Command payload to cancel an active appointment with a reason.
 */
export class CancelAppointmentCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;
  public readonly input: CancelAppointmentCommandInput;

  constructor(
    input: CancelAppointmentCommandInput,
    commandId?: string,
    timestamp: Date = new Date(),
  ) {
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
