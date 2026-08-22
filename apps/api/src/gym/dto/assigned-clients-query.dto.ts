import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { IsIn, IsInt, IsISO8601, IsOptional, Max, Min } from 'class-validator';
import { MembershipStatus } from '@kinergy-platform/core';

export class AssignedClientsQueryDto {
  @ApiPropertyOptional({
    description: '1-indexed page number for deterministic pagination',
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
    description: 'Maximum number of items per page (capped at 100)',
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

  @ApiPropertyOptional({
    description: 'Field to sort assigned client memberships by',
    enum: ['daysRemaining', 'endDate', 'startDate', 'assignedAt'],
    default: 'daysRemaining',
  })
  @IsOptional()
  @IsIn(['daysRemaining', 'endDate', 'startDate', 'assignedAt'])
  sortBy?: 'daysRemaining' | 'endDate' | 'startDate' | 'assignedAt' = 'daysRemaining';

  @ApiPropertyOptional({
    description: 'Sort direction order',
    enum: ['ASC', 'DESC'],
    default: 'ASC',
  })
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'ASC';

  @ApiPropertyOptional({
    description: 'Filter by membership lifecycle statuses (comma-separated or array)',
    example: 'ACTIVE,FROZEN',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map((s) => s.trim().toUpperCase());
    }
    return value;
  })
  statuses?: MembershipStatus[];

  @ApiPropertyOptional({
    description: 'Evaluation date for temporal status projections (ISO UTC string)',
    example: '2026-08-22T00:00:00.000Z',
  })
  @IsOptional()
  @IsISO8601()
  asOfDate?: string;

  @ApiPropertyOptional({
    description: 'Lookahead horizon in days for expiring-soon indicator calculation',
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
}
