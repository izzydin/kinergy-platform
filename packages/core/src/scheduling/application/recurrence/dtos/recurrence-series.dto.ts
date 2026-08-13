export interface RecurrenceExceptionDTO {
  readonly occurrenceIndex: number;
  readonly date: string;
  readonly type: string;
  readonly reason?: string;
}

export interface RecurrencePatternDTO {
  readonly frequency: string;
  readonly startDate: string;
  readonly endDate?: string;
  readonly maxOccurrences?: number;
  readonly localStartTime: {
    readonly hour: number;
    readonly minute: number;
  };
  readonly durationMinutes: number;
  readonly timezone?: string;
}

export interface RecurrenceSeriesDTO {
  readonly id: string;
  readonly clientId: string;
  readonly therapistId: string;
  readonly roomId: string;
  readonly serviceType: string;
  readonly pattern: RecurrencePatternDTO;
  readonly exceptions: ReadonlyArray<RecurrenceExceptionDTO>;
  readonly status: string;
  readonly cancellationReason?: string;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}
