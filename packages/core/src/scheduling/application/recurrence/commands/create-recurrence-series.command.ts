import { Command } from '../../shared/command.interface';
import { RecurrenceFrequency } from '../../../domain/recurrence/value-objects/recurrence-frequency.enum';

export interface CreateRecurrenceSeriesInput {
  readonly clientId: string;
  readonly therapistId: string;
  readonly roomId: string;
  readonly serviceType: string;
  readonly frequency: RecurrenceFrequency | string;
  readonly startDate: Date | string;
  readonly endDate?: Date | string;
  readonly maxOccurrences?: number;
  readonly localStartTime: {
    readonly hour: number;
    readonly minute: number;
  };
  readonly durationMinutes: number;
  readonly timezone?: string;
  readonly horizonDays?: number;
}

export class CreateRecurrenceSeriesCommand implements Command {
  public readonly commandId: string;
  public readonly timestamp: Date;
  public readonly input: CreateRecurrenceSeriesInput;

  constructor(
    input: CreateRecurrenceSeriesInput,
    commandId?: string,
    timestamp: Date = new Date(),
  ) {
    if (!input.clientId || input.clientId.trim().length === 0) {
      throw new Error('clientId is required for CreateRecurrenceSeriesCommand.');
    }
    if (!input.therapistId || input.therapistId.trim().length === 0) {
      throw new Error('therapistId is required for CreateRecurrenceSeriesCommand.');
    }
    if (!input.roomId || input.roomId.trim().length === 0) {
      throw new Error('roomId is required for CreateRecurrenceSeriesCommand.');
    }
    if (!input.serviceType || input.serviceType.trim().length === 0) {
      throw new Error('serviceType is required for CreateRecurrenceSeriesCommand.');
    }
    if (!input.frequency) {
      throw new Error('frequency is required for CreateRecurrenceSeriesCommand.');
    }
    if (!input.startDate) {
      throw new Error('startDate is required for CreateRecurrenceSeriesCommand.');
    }

    this.commandId = commandId ?? `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.timestamp = timestamp;
    this.input = input;
    Object.freeze(this);
  }
}
