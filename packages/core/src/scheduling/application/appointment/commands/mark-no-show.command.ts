import { Command } from '../../shared/command.interface';

/** Input payload for MarkNoShowCommand */
export interface MarkNoShowCommandInput {
  readonly appointmentId: string;
  readonly expectedVersion: number;
  readonly reason?: string;
}

/**
 * CQRS Command payload to tag an appointment as NO_SHOW.
 */
export class MarkNoShowCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;
  public readonly input: MarkNoShowCommandInput;

  constructor(input: MarkNoShowCommandInput, commandId?: string, timestamp: Date = new Date()) {
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
