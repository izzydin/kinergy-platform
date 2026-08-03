import { Command } from '../../shared/command.interface';

/** Input payload for AssignRoomCommand */
export interface AssignRoomCommandInput {
  readonly appointmentId: string;
  readonly newRoomId: string;
  readonly expectedVersion: number;
  readonly requiredCapacity?: number;
  readonly requiredFeatures?: string[];
}

/**
 * CQRS Command payload to assign or reassign a room asset to an appointment.
 */
export class AssignRoomCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;
  public readonly input: AssignRoomCommandInput;

  constructor(input: AssignRoomCommandInput, commandId?: string, timestamp: Date = new Date()) {
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
