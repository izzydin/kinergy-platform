import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';

export class ExpiringMembershipsQueryDto {
  @ApiPropertyOptional({
    description: 'Lookahead horizon window in days (default 7 days, max 90)',
    example: 7,
    default: 7,
    minimum: 1,
    maximum: 90,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  horizonDays?: number = 7;

  @ApiPropertyOptional({
    description: 'Evaluation date for temporal status calculations (ISO UTC string)',
    example: '2026-08-22T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  asOfDate?: string;
}
