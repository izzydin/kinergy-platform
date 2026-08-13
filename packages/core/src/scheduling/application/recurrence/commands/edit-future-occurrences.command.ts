import { Command } from '../../shared/command.interface';
import { RecurrenceFrequency } from '../../../domain/recurrence/value-objects/recurrence-frequency.enum';

export interface EditFutureOccurrencesInput {
  readonly seriesId: string;
  readonly fromOccurrenceIndex: number;
  readonly fromDate: Date | string;
  readonly newFrequency?: RecurrenceFrequency;
  readonly newLocalStartTime?: { hour: number; minute: number };
  readonly newDurationMinutes?: number;
  readonly newTherapistId?: string;
  readonly newRoomId?: string;
  readonly newServiceType?: string;
  readonly newEndDate?: Date | string;
  readonly newMaxOccurrences?: number;
  readonly reason?: string;
}

export class EditFutureOccurrencesCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;
  public readonly input: EditFutureOccurrencesInput;

  constructor(input: EditFutureOccurrencesInput, commandId?: string, timestamp: Date = new Date()) {
    if (!input.seriesId || input.seriesId.trim().length === 0) {
      throw new Error('seriesId is required for EditFutureOccurrencesCommand.');
    }
    if (input.fromOccurrenceIndex === undefined || input.fromOccurrenceIndex < 0) {
      throw new Error('Valid non-negative fromOccurrenceIndex is required.');
    }
    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
