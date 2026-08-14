import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class EditSingleOccurrenceRequestDto {
  @ApiPropertyOptional({
    description: 'New ISO 8601 start timestamp for the detached occurrence',
    example: '2026-09-15T14:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  newStartTime?: string;

  @ApiPropertyOptional({
    description: 'New duration in minutes',
    example: 60,
    minimum: 15,
    maximum: 240,
  })
  @IsOptional()
  @IsInt()
  @Min(15)
  @Max(240)
  newDurationMinutes?: number;

  @ApiPropertyOptional({
    description: 'Reassigned Therapist ID',
    example: '550e8400-e29b-41d4-a716-446655440005',
  })
  @IsOptional()
  @IsString()
  newTherapistId?: string;

  @ApiPropertyOptional({
    description: 'Reassigned Treatment Room ID',
    example: '550e8400-e29b-41d4-a716-446655440006',
  })
  @IsOptional()
  @IsString()
  newRoomId?: string;

  @ApiPropertyOptional({
    description: 'Clinical / administrative reason for modifying this specific occurrence',
    example: 'Client requested later afternoon slot',
  })
  @IsOptional()
  @IsString()
  rescheduleReason?: string;
}
