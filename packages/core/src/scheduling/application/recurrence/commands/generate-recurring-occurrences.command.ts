import { Command } from '../../shared/command.interface';

export interface GenerateRecurringOccurrencesInput {
  readonly seriesId: string;
  readonly horizonDays?: number;
  readonly windowStart?: Date | string;
  readonly windowEnd?: Date | string;
}

export class GenerateRecurringOccurrencesCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;
  public readonly input: GenerateRecurringOccurrencesInput;

  constructor(
    input: GenerateRecurringOccurrencesInput,
    commandId?: string,
    timestamp: Date = new Date(),
  ) {
    if (!input.seriesId || input.seriesId.trim().length === 0) {
      throw new Error('seriesId is required for GenerateRecurringOccurrencesCommand.');
    }
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
