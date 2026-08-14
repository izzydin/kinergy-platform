import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RecurrenceExceptionResponseDto {
  @ApiProperty({ example: 1 })
  occurrenceIndex!: number;

  @ApiProperty({ example: '2026-09-08T09:00:00.000Z' })
  date!: string;

  @ApiProperty({ example: 'SKIPPED' })
  type!: string;

  @ApiPropertyOptional({ example: 'Client vacation' })
  reason?: string;
}

export class RecurrencePatternResponseDto {
  @ApiProperty({ example: 'WEEKLY' })
  frequency!: string;

  @ApiProperty({ example: '2026-09-01T09:00:00.000Z' })
  startDate!: string;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59.999Z' })
  endDate?: string;

  @ApiPropertyOptional({ example: 12 })
  maxOccurrences?: number;

  @ApiProperty({ example: { hour: 9, minute: 30 } })
  localStartTime!: { hour: number; minute: number };

  @ApiProperty({ example: 60 })
  durationMinutes!: number;

  @ApiPropertyOptional({ example: 'America/New_York' })
  timezone?: string;
}

export class RecurrenceSeriesResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'client_123' })
  clientId!: string;

  @ApiProperty({ example: 'therapist_456' })
  therapistId!: string;

  @ApiProperty({ example: 'room_789' })
  roomId!: string;

  @ApiProperty({ example: 'TREATMENT' })
  serviceType!: string;

  @ApiProperty({ type: RecurrencePatternResponseDto })
  pattern!: RecurrencePatternResponseDto;

  @ApiProperty({ type: [RecurrenceExceptionResponseDto] })
  exceptions!: RecurrenceExceptionResponseDto[];

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiPropertyOptional({ example: 'Course completed' })
  cancellationReason?: string;

  @ApiProperty({ example: 1 })
  version!: number;

  @ApiProperty({ example: '2026-08-13T19:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-13T19:00:00.000Z' })
  updatedAt!: string;
}

export class ConflictingOccurrenceResponseDto {
  @ApiProperty({ example: 2 })
  occurrenceIndex!: number;

  @ApiProperty({ example: '2026-09-15T09:00:00.000Z' })
  startTime!: string;

  @ApiProperty({ example: '2026-09-15T10:00:00.000Z' })
  endTime!: string;

  @ApiProperty({ example: 'THERAPIST' })
  conflictType!: string;

  @ApiProperty({ example: 'therapist_456' })
  conflictingEntityId!: string;

  @ApiProperty({ example: 'Therapist has an overlapping booking' })
  reason!: string;
}

export class OccurrenceGenerationSummaryDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  seriesId!: string;

  @ApiProperty({ example: 8 })
  generatedCount!: number;

  @ApiProperty({ example: 1 })
  conflictCount!: number;

  @ApiProperty({ type: [ConflictingOccurrenceResponseDto] })
  conflictingOccurrences!: ConflictingOccurrenceResponseDto[];
}

export class CreateRecurrenceSeriesResponseDto {
  @ApiProperty({ type: RecurrenceSeriesResponseDto })
  series!: RecurrenceSeriesResponseDto;

  @ApiProperty({ type: OccurrenceGenerationSummaryDto })
  initialGeneration!: OccurrenceGenerationSummaryDto;
}

export class SkipOccurrenceResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  seriesId!: string;

  @ApiProperty({ example: 2 })
  occurrenceIndex!: number;

  @ApiProperty({ example: '2026-09-15T09:00:00.000Z' })
  occurrenceDate!: string;

  @ApiProperty({ example: true })
  materializedAppointmentCancelled!: boolean;
}

export class EditFutureOccurrencesResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  originalSeriesId!: string;

  @ApiProperty({ example: '660e8400-e29b-41d4-a716-446655440000' })
  newSeriesId!: string;

  @ApiProperty({ example: 4 })
  cancelledFutureCount!: number;

  @ApiProperty({ type: OccurrenceGenerationSummaryDto })
  newSeriesGeneration!: OccurrenceGenerationSummaryDto;
}

export class CancelRecurrenceSeriesResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  seriesId!: string;

  @ApiProperty({ example: 6 })
  cancelledFutureAppointmentsCount!: number;

  @ApiProperty({ example: 3 })
  preservedCompletedCount!: number;
}
