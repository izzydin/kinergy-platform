import { Command } from '../../shared/command.interface';

export interface CancelRecurrenceSeriesInput {
  readonly seriesId: string;
  readonly reason: string;
  readonly cancelFutureMaterialized?: boolean;
}

export class CancelRecurrenceSeriesCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;
  public readonly input: CancelRecurrenceSeriesInput;

  constructor(
    input: CancelRecurrenceSeriesInput,
    commandId?: string,
    timestamp: Date = new Date(),
  ) {
    if (!input.seriesId || input.seriesId.trim().length === 0) {
      throw new Error('seriesId is required for CancelRecurrenceSeriesCommand.');
    }
    if (!input.reason || input.reason.trim().length === 0) {
      throw new Error('reason is required for CancelRecurrenceSeriesCommand.');
    }
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
