import { Command } from '../../shared/command.interface';

export interface CancelMaintenanceCommandInput {
  readonly roomId: string;
  readonly maintenanceWindowId: string;
  readonly expectedVersion?: number;
}

export class CancelMaintenanceCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;
  public readonly input: CancelMaintenanceCommandInput;

  constructor(
    input: CancelMaintenanceCommandInput,
    commandId?: string,
    timestamp: Date = new Date(),
  ) {
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
