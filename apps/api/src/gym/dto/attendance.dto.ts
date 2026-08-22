import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CheckInMethod, AccessResult } from '@kinergy-platform/core';

export class RecordCheckInRequestDto {
  @ApiProperty({ example: 'cli_123', description: 'Client master ID' })
  @IsString()
  @IsNotEmpty()
  clientId!: string;

  @ApiPropertyOptional({
    enum: CheckInMethod,
    example: CheckInMethod.QR_CODE,
    default: CheckInMethod.QR_CODE,
  })
  @IsEnum(CheckInMethod)
  @IsOptional()
  method?: CheckInMethod;

  @ApiPropertyOptional({ example: 'gate_turnstile_1' })
  @IsString()
  @IsOptional()
  gateId?: string;

  @ApiPropertyOptional({ example: 'Staff check-in at reception' })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ example: 'idemp_key_123' })
  @IsString()
  @IsOptional()
  idempotencyKey?: string;
}

export class DailyAttendanceQueryDto {
  @ApiPropertyOptional({ example: '2026-08-22', description: 'Local GymDay date in YYYY-MM-DD' })
  @IsString()
  @IsOptional()
  date?: string;

  @ApiPropertyOptional({ example: 'fac_main', default: 'fac_main' })
  @IsString()
  @IsOptional()
  facilityId?: string;

  @ApiPropertyOptional({ enum: AccessResult, example: AccessResult.GRANTED })
  @IsEnum(AccessResult)
  @IsOptional()
  result?: AccessResult;

  @ApiPropertyOptional({ enum: CheckInMethod, example: CheckInMethod.QR_CODE })
  @IsEnum(CheckInMethod)
  @IsOptional()
  method?: CheckInMethod;

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

export class ClientAttendanceHistoryQueryDto {
  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsDateString()
  @IsOptional()
  dateTo?: string;

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

export class AttendanceSummaryQueryDto {
  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsString()
  @IsOptional()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsString()
  @IsOptional()
  endDate?: string;

  @ApiPropertyOptional({ example: 'fac_main' })
  @IsString()
  @IsOptional()
  facilityId?: string;
}

export class SearchAttendanceQueryDto {
  @ApiPropertyOptional({ example: 'cli_123' })
  @IsString()
  @IsOptional()
  clientId?: string;

  @ApiPropertyOptional({ example: '2026-08-22' })
  @IsString()
  @IsOptional()
  gymDay?: string;

  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsDateString()
  @IsOptional()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-08-31' })
  @IsDateString()
  @IsOptional()
  dateTo?: string;

  @ApiPropertyOptional({ example: 'fac_main' })
  @IsString()
  @IsOptional()
  facilityId?: string;

  @ApiPropertyOptional({ enum: AccessResult, example: AccessResult.GRANTED })
  @IsEnum(AccessResult)
  @IsOptional()
  result?: AccessResult;

  @ApiPropertyOptional({ enum: CheckInMethod, example: CheckInMethod.QR_CODE })
  @IsEnum(CheckInMethod)
  @IsOptional()
  method?: CheckInMethod;

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

export class RecordCheckInResponseDto {
  @ApiProperty({ example: true })
  isGranted!: boolean;

  @ApiProperty({ example: 'GRANTED' })
  outcome!: string;

  @ApiPropertyOptional({ example: 'att_123' })
  attendanceId!: string | null;

  @ApiProperty({ example: 'cli_123' })
  clientId!: string;

  @ApiPropertyOptional({ example: 'mem_123' })
  membershipId!: string | null;

  @ApiPropertyOptional({ example: 'plan_123' })
  planId!: string | null;

  @ApiProperty({ example: '2026-08-22T10:30:00.000Z' })
  checkInTime!: string;

  @ApiProperty({
    example: { localDate: '2026-08-22', timezone: 'America/Guayaquil', facilityId: 'fac_main' },
  })
  gymDay!: {
    localDate: string;
    timezone: string;
    facilityId: string;
  };

  @ApiProperty({ example: 'QR_CODE' })
  method!: string;

  @ApiPropertyOptional({ example: 'gate_1' })
  gateId!: string | null;

  @ApiPropertyOptional({ example: 'usr_receptionist' })
  receptionistId!: string | null;

  @ApiProperty({ example: false })
  isDuplicate!: boolean;

  @ApiProperty({ example: false })
  isIdempotentReplay!: boolean;

  @ApiPropertyOptional({ example: null })
  denialReason!: string | null;
}

export class AttendanceItemDto {
  @ApiProperty({ example: 'att_123' })
  id!: string;

  @ApiProperty({ example: 'cli_123' })
  clientId!: string;

  @ApiPropertyOptional({ example: 'mem_123' })
  membershipId!: string | null;

  @ApiProperty({ example: '2026-08-22T10:30:00.000Z' })
  checkInTime!: string;

  @ApiProperty({ example: '2026-08-22' })
  gymDay!: string;

  @ApiProperty({ example: 'fac_main' })
  facilityId!: string;

  @ApiProperty({ example: 'QR_CODE' })
  method!: string;

  @ApiProperty({ example: 'GRANTED' })
  result!: string;

  @ApiPropertyOptional({ example: 'gate_1' })
  gateId!: string | null;

  @ApiPropertyOptional({ example: 'usr_rec' })
  receptionistId!: string | null;

  @ApiPropertyOptional({ example: null })
  notes!: string | null;
}

export class PaginationMetadataDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 100 })
  totalItems!: number;

  @ApiProperty({ example: 5 })
  totalPages!: number;

  @ApiProperty({ example: true })
  hasNextPage!: boolean;

  @ApiProperty({ example: false })
  hasPreviousPage!: boolean;
}

export class AttendanceDailyKPIsDto {
  @ApiProperty({ example: 50 })
  totalCheckIns!: number;

  @ApiProperty({ example: 45 })
  grantedCount!: number;

  @ApiProperty({ example: 5 })
  deniedCount!: number;

  @ApiProperty({ example: 40 })
  uniqueClientsCount!: number;
}

export class ClientAttendanceStatsDto {
  @ApiProperty({ example: 24 })
  totalVisits!: number;

  @ApiPropertyOptional({ example: '2026-08-01T10:00:00.000Z' })
  firstVisitAt!: string | null;

  @ApiPropertyOptional({ example: '2026-08-22T10:30:00.000Z' })
  lastVisitAt!: string | null;
}

export class PaginatedAttendanceResponseDto {
  @ApiProperty({ type: [AttendanceItemDto] })
  items!: AttendanceItemDto[];

  @ApiProperty({ type: PaginationMetadataDto })
  pagination!: PaginationMetadataDto;

  @ApiPropertyOptional({ type: AttendanceDailyKPIsDto })
  dailySummary?: AttendanceDailyKPIsDto;

  @ApiPropertyOptional({ type: ClientAttendanceStatsDto })
  clientStats?: ClientAttendanceStatsDto;
}
