import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { RecurrenceFrequency } from '@kinergy-platform/core';
import { LocalStartTimeDto } from './create-recurrence-series.dto';

export class EditFutureOccurrencesRequestDto {
  @ApiProperty({
    description: 'ISO 8601 cutoff date from which future modifications take effect',
    example: '2026-10-01T00:00:00.000Z',
  })
  @IsISO8601()
  cutoffDate!: string;

  @ApiPropertyOptional({
    description: 'Optional occurrence index cutoff (defaults to 0 if not specified)',
    example: 3,
    minimum: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  fromOccurrenceIndex?: number;

  @ApiPropertyOptional({
    description: 'Updated recurrence frequency for future occurrences',
    example: 'BIWEEKLY',
    enum: RecurrenceFrequency,
  })
  @IsOptional()
  @IsEnum(RecurrenceFrequency)
  newFrequency?: RecurrenceFrequency;

  @ApiPropertyOptional({
    description: 'Updated local wall-clock start time',
    type: LocalStartTimeDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => LocalStartTimeDto)
  newLocalStartTime?: LocalStartTimeDto;

  @ApiPropertyOptional({
    description: 'Updated duration in minutes',
    example: 90,
    minimum: 15,
    maximum: 240,
  })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(240)
  newDurationMinutes?: number;

  @ApiPropertyOptional({
    description: 'Updated assigned therapist ID',
    example: '550e8400-e29b-41d4-a716-446655440010',
  })
  @IsOptional()
  @IsString()
  newTherapistId?: string;

  @ApiPropertyOptional({
    description: 'Updated assigned room ID',
    example: '550e8400-e29b-41d4-a716-446655440012',
  })
  @IsOptional()
  @IsString()
  newRoomId?: string;

  @ApiPropertyOptional({
    description: 'Updated termination date for the new series branch',
    example: '2026-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsISO8601()
  newEndDate?: string;

  @ApiPropertyOptional({
    description: 'Updated max occurrence count for the new series branch',
    example: 10,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  newMaxOccurrences?: number;

  @ApiPropertyOptional({
    description: 'Updated IANA timezone identifier',
    example: 'America/New_York',
  })
  @IsOptional()
  @IsString()
  newTimezone?: string;

  @ApiPropertyOptional({
    description:
      'Rolling horizon in days to generate for the new series branch (default: 60, max: 90)',
    example: 60,
    default: 60,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  horizonDays?: number;
}
