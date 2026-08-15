import { Command } from '../../shared/command.interface';

export interface DeactivateRoomCommandInput {
  readonly roomId: string;
  readonly reason?: string;
  readonly expectedVersion?: number;
}

export class DeactivateRoomCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;
  public readonly input: DeactivateRoomCommandInput;

  constructor(input: DeactivateRoomCommandInput, commandId?: string, timestamp: Date = new Date()) {
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
