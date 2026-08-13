import { Command } from '../../shared/command.interface';

export interface SkipRecurrenceOccurrenceInput {
  readonly seriesId: string;
  readonly occurrenceIndex: number;
  readonly date?: Date | string;
  readonly reason?: string;
}

export class SkipRecurrenceOccurrenceCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;
  public readonly input: SkipRecurrenceOccurrenceInput;

  constructor(
    input: SkipRecurrenceOccurrenceInput,
    commandId?: string,
    timestamp: Date = new Date(),
  ) {
    if (!input.seriesId || input.seriesId.trim().length === 0) {
      throw new Error('seriesId is required for SkipRecurrenceOccurrenceCommand.');
    }
    if (input.occurrenceIndex === undefined || input.occurrenceIndex < 0) {
      throw new Error('Valid non-negative occurrenceIndex is required.');
    }
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
