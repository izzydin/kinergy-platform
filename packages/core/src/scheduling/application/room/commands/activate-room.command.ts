import { Command } from '../../shared/command.interface';

export interface ActivateRoomCommandInput {
  readonly roomId: string;
  readonly expectedVersion?: number;
}

export class ActivateRoomCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;
  public readonly input: ActivateRoomCommandInput;

  constructor(input: ActivateRoomCommandInput, commandId?: string, timestamp: Date = new Date()) {
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
