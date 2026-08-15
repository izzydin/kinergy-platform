import { Command } from '../../shared/command.interface';

export interface ScheduleMaintenanceCommandInput {
  readonly roomId: string;
  readonly startTime: string | Date;
  readonly endTime: string | Date;
  readonly reason: string;
  readonly expectedVersion?: number;
}

export class ScheduleMaintenanceCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;
  public readonly input: ScheduleMaintenanceCommandInput;

  constructor(
    input: ScheduleMaintenanceCommandInput,
    commandId?: string,
    timestamp: Date = new Date(),
  ) {
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
