import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class TrainerAttendanceQueryDto {
  @ApiPropertyOptional({
    description: 'Target operational date (ISO format or YYYY-MM-DD)',
    example: '2026-08-22',
  })
  @IsOptional()
  @IsString()
  date?: string;

  @ApiPropertyOptional({
    description: 'Facility identifier (default "main")',
    example: 'main',
  })
  @IsOptional()
  @IsString()
  facilityId?: string = 'main';

  @ApiPropertyOptional({
    description: 'Facility operational timezone (default "UTC")',
    example: 'America/New_York',
  })
  @IsOptional()
  @IsString()
  timezone?: string = 'UTC';

  @ApiPropertyOptional({
    description: '1-indexed page number',
    example: 1,
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Maximum items per page',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
