import { Command } from '../../shared/command.interface';

export interface EditRoomCommandInput {
  readonly roomId: string;
  readonly name?: string;
  readonly capacity?: number;
  readonly features?: string[];
  readonly expectedVersion?: number;
}

export class EditRoomCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;
  public readonly input: EditRoomCommandInput;

  constructor(input: EditRoomCommandInput, commandId?: string, timestamp: Date = new Date()) {
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
