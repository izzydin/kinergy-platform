import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { RecurrenceFrequency } from '@kinergy-platform/core';

export class LocalStartTimeDto {
  @ApiProperty({
    description: 'Hour of the day in 24-hour format (0-23)',
    example: 9,
    minimum: 0,
    maximum: 23,
  })
  @IsInt()
  @Min(0)
  @Max(23)
  hour!: number;

  @ApiProperty({
    description: 'Minute of the hour (0-59)',
    example: 30,
    minimum: 0,
    maximum: 59,
  })
  @IsInt()
  @Min(0)
  @Max(59)
  minute!: number;
}

export class CreateRecurrenceSeriesRequestDto {
  @ApiProperty({
    description: 'Target Client ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsNotEmpty()
  clientId!: string;

  @ApiProperty({
    description: 'Assigned Therapist ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  @IsString()
  @IsNotEmpty()
  therapistId!: string;

  @ApiProperty({
    description: 'Assigned Room ID',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  @IsString()
  @IsNotEmpty()
  roomId!: string;

  @ApiProperty({
    description: 'Service / Appointment Type',
    example: 'TREATMENT',
  })
  @IsString()
  @IsNotEmpty()
  serviceType!: string;

  @ApiProperty({
    description: 'Recurrence frequency pattern',
    example: 'WEEKLY',
    enum: RecurrenceFrequency,
  })
  @IsEnum(RecurrenceFrequency)
  frequency!: RecurrenceFrequency;

  @ApiProperty({
    description: 'ISO 8601 start date of the series',
    example: '2026-09-01T09:00:00.000Z',
  })
  @IsISO8601()
  startDate!: string;

  @ApiPropertyOptional({
    description: 'Optional ISO 8601 termination date',
    example: '2026-12-31T23:59:59.999Z',
  })
  @IsOptional()
  @IsISO8601()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Optional maximum occurrence count',
    example: 12,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxOccurrences?: number;

  @ApiProperty({
    description: 'Local wall-clock start time',
    type: LocalStartTimeDto,
  })
  @ValidateNested()
  @Type(() => LocalStartTimeDto)
  localStartTime!: LocalStartTimeDto;

  @ApiProperty({
    description: 'Duration of each appointment in minutes',
    example: 60,
    minimum: 15,
    maximum: 240,
  })
  @IsInt()
  @Min(15)
  @Max(240)
  durationMinutes!: number;

  @ApiPropertyOptional({
    description: 'IANA Timezone identifier',
    example: 'America/New_York',
    default: 'UTC',
  })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({
    description: 'Initial rolling window horizon in days (default: 60, max: 90)',
    example: 60,
    default: 60,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  horizonDays?: number;
}
