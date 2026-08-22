import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMembershipRequestDto {
  @ApiProperty({ example: 'cli_123', description: 'Client master ID' })
  @IsString()
  @IsNotEmpty()
  clientId!: string;

  @ApiProperty({ example: 'plan_123', description: 'Active Membership Plan ID' })
  @IsString()
  @IsNotEmpty()
  planId!: string;

  @ApiPropertyOptional({ example: '2026-08-22T00:00:00.000Z', description: 'Start date' })
  @IsDateString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ example: 'usr_trainer_1', description: 'Assigned Trainer ID' })
  @IsString()
  @IsOptional()
  assignedTrainerId?: string;
}

export class RenewMembershipRequestDto {
  @ApiPropertyOptional({ example: 'plan_new_123', description: 'Optional new Plan ID' })
  @IsString()
  @IsOptional()
  newPlanId?: string;

  @ApiPropertyOptional({
    example: '2026-08-22T00:00:00.000Z',
    description: 'Effective renewal date',
  })
  @IsDateString()
  @IsOptional()
  effectiveDate?: string;
}

export class FreezeMembershipRequestDto {
  @ApiProperty({ example: '2026-09-01T00:00:00.000Z', description: 'Freeze window start date' })
  @IsDateString()
  @IsNotEmpty()
  startDate!: string;

  @ApiProperty({ example: '2026-09-15T00:00:00.000Z', description: 'Freeze window end date' })
  @IsDateString()
  @IsNotEmpty()
  endDate!: string;

  @ApiPropertyOptional({ example: 'Medical leave with doctor certificate' })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class CancelMembershipRequestDto {
  @ApiPropertyOptional({ example: 'Client relocated to another city' })
  @IsString()
  @IsOptional()
  reason?: string;
}

export class ExpireMembershipsBatchRequestDto {
  @ApiPropertyOptional({ example: '2026-08-22T00:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  asOfDate?: string;

  @ApiPropertyOptional({ example: 100, default: 50 })
  @IsNumber()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  batchSize?: number;

  @ApiPropertyOptional({ example: false, default: false })
  @IsBoolean()
  @IsOptional()
  dryRun?: boolean;
}

export class ListMembershipsQueryDto {
  @ApiPropertyOptional({ example: 'cli_123' })
  @IsString()
  @IsOptional()
  clientId?: string;

  @ApiPropertyOptional({ example: 'plan_123' })
  @IsString()
  @IsOptional()
  planId?: string;

  @ApiPropertyOptional({ example: 'ACTIVE' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ example: '2026-08-01T00:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  startDateFrom?: string;

  @ApiPropertyOptional({ example: '2026-08-31T00:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  startDateTo?: string;

  @ApiPropertyOptional({ example: '2026-08-01T00:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  endDateFrom?: string;

  @ApiPropertyOptional({ example: '2026-08-31T00:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  endDateTo?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsNumber()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsNumber()
  @Min(1)
  @IsOptional()
  @Type(() => Number)
  limit?: number;
}

export class CheckEligibilityQueryDto {
  @ApiProperty({ example: 'cli_123' })
  @IsString()
  @IsNotEmpty()
  clientId!: string;

  @ApiPropertyOptional({ example: '2026-08-22T10:00:00.000Z' })
  @IsDateString()
  @IsOptional()
  asOf?: string;
}

export class MembershipPeriodDto {
  @ApiProperty({ example: '2026-08-01T00:00:00.000Z' })
  startDate!: string;

  @ApiProperty({ example: '2026-08-31T00:00:00.000Z' })
  endDate!: string;

  @ApiProperty({ example: 30 })
  durationDays!: number;
}

export class FreezeWindowDto {
  @ApiProperty({ example: '2026-08-10T00:00:00.000Z' })
  startDate!: string;

  @ApiProperty({ example: '2026-08-15T00:00:00.000Z' })
  endDate!: string;

  @ApiPropertyOptional({ example: 'Injury recovery' })
  reason?: string;
}

export class MembershipResponseDto {
  @ApiProperty({ example: 'mem_123' })
  id!: string;

  @ApiProperty({ example: 'cli_123' })
  clientId!: string;

  @ApiProperty({ example: 'plan_123' })
  planId!: string;

  @ApiProperty({ type: MembershipPeriodDto })
  period!: MembershipPeriodDto;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiPropertyOptional({ example: 'usr_trainer_1' })
  assignedTrainerId?: string;

  @ApiPropertyOptional({ type: [FreezeWindowDto] })
  freezeHistory?: FreezeWindowDto[];

  @ApiPropertyOptional({ example: 'Client relocated' })
  cancellationReason?: string;

  @ApiProperty({ example: 1 })
  version!: number;

  @ApiProperty({ example: '2026-08-01T00:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-01T00:00:00.000Z' })
  updatedAt!: string;
}

export class PaginatedMembershipsResponseDto {
  @ApiProperty({ type: [MembershipResponseDto] })
  items!: MembershipResponseDto[];

  @ApiProperty({ example: 10 })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 1 })
  totalPages!: number;

  @ApiProperty({ example: false })
  hasNextPage!: boolean;

  @ApiProperty({ example: false })
  hasPreviousPage!: boolean;
}

export class MembershipEligibilityResponseDto {
  @ApiProperty({ example: true })
  isEligible!: boolean;

  @ApiProperty({ example: 'ELIGIBLE' })
  outcome!: string;

  @ApiPropertyOptional({ example: 'mem_123' })
  membershipId!: string | null;

  @ApiPropertyOptional({ example: 'plan_123' })
  planId!: string | null;

  @ApiPropertyOptional({ example: null })
  period!: { startDate: string; endDate: string } | null;

  @ApiProperty({ example: '2026-08-22T10:00:00.000Z' })
  evaluatedAt!: string;

  @ApiProperty({ example: 'Client has valid active membership' })
  reason!: string;
}

export class ExpiredMembershipDetailDto {
  @ApiProperty({ example: 'mem_123' })
  membershipId!: string;

  @ApiProperty({ example: 'cli_123' })
  clientId!: string;

  @ApiProperty({ example: 'ACTIVE' })
  previousStatus!: string;

  @ApiProperty({ example: '2026-08-22T00:00:00.000Z' })
  expiredAt!: string;
}

export class FailedMembershipDetailDto {
  @ApiProperty({ example: 'mem_123' })
  membershipId!: string;

  @ApiProperty({ example: 'Lock timeout' })
  error!: string;
}

export class ExpireMembershipsBatchResponseDto {
  @ApiProperty({ example: 50 })
  processedCount!: number;

  @ApiProperty({ example: 5 })
  expiredCount!: number;

  @ApiProperty({ example: 45 })
  skippedCount!: number;

  @ApiProperty({ example: 0 })
  failedCount!: number;

  @ApiProperty({ example: 120 })
  durationMs!: number;

  @ApiProperty({ example: false })
  dryRun!: boolean;

  @ApiProperty({ type: [ExpiredMembershipDetailDto] })
  expired!: ExpiredMembershipDetailDto[];

  @ApiProperty({ type: [FailedMembershipDetailDto] })
  errors!: FailedMembershipDetailDto[];
}
