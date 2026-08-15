import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsISO8601, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class ScheduleMaintenanceRequestDto {
  @ApiProperty({
    description: 'ISO 8601 UTC start timestamp of the maintenance window',
    example: '2026-09-01T12:00:00.000Z',
  })
  @IsISO8601()
  @IsNotEmpty()
  startTime!: string;

  @ApiProperty({
    description: 'ISO 8601 UTC end timestamp of the maintenance window',
    example: '2026-09-01T14:00:00.000Z',
  })
  @IsISO8601()
  @IsNotEmpty()
  endTime!: string;

  @ApiProperty({
    description: 'Explanation reason for the maintenance window',
    example: 'Water filtration system maintenance',
  })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional({
    description: 'Expected optimistic concurrency control version counter',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}
