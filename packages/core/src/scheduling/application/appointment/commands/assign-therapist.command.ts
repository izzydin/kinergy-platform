import { Command } from '../../shared/command.interface';

/** Input payload for AssignTherapistCommand */
export interface AssignTherapistCommandInput {
  readonly appointmentId: string;
  readonly newTherapistId: string;
  readonly expectedVersion: number;
}

/**
 * CQRS Command payload to assign or reassign a therapist to an appointment.
 */
export class AssignTherapistCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;
  public readonly input: AssignTherapistCommandInput;

  constructor(
    input: AssignTherapistCommandInput,
    commandId?: string,
    timestamp: Date = new Date(),
  ) {
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
