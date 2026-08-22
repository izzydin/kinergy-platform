import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsOptional,
  Min,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateMembershipPlanRequestDto {
  @ApiProperty({ example: 'STD_MONTHLY', description: 'Unique commercial plan code' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ example: 'Standard Monthly Pass', description: 'Display name of plan' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ example: 'Full gym facility access during standard hours' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 30, description: 'Duration in days' })
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  durationInDays!: number;

  @ApiProperty({ example: 4999, description: 'Price in minor currency units (cents)' })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  priceAmount!: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsString()
  @IsOptional()
  priceCurrency?: string;

  @ApiPropertyOptional({ example: 30, description: 'Maximum visit quota (if applicable)' })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  @Type(() => Number)
  visitQuota?: number;
}

export class UpdateMembershipPlanPricingRequestDto {
  @ApiProperty({ example: 5999, description: 'New price in minor units (cents)' })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  priceAmount!: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsString()
  @IsOptional()
  currency?: string;
}

export class ListMembershipPlansQueryDto {
  @ApiPropertyOptional({ description: 'Filter only active plans', default: false })
  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  activeOnly?: boolean;

  @ApiPropertyOptional({ example: 'ACTIVE', description: 'Filter by exact plan status' })
  @IsString()
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ example: 'monthly', description: 'Search term for name/code' })
  @IsString()
  @IsOptional()
  search?: string;

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

export class MembershipPlanResponseDto {
  @ApiProperty({ example: 'plan_123' })
  id!: string;

  @ApiProperty({ example: 'STD_MONTHLY' })
  code!: string;

  @ApiProperty({ example: 'Standard Monthly Pass' })
  name!: string;

  @ApiPropertyOptional({ example: 'Full access' })
  description?: string;

  @ApiProperty({ example: 30 })
  durationInDays!: number;

  @ApiProperty({ example: 4999 })
  priceAmount!: number;

  @ApiProperty({ example: 'USD' })
  priceCurrency!: string;

  @ApiPropertyOptional({ example: 30 })
  visitQuota?: number;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiProperty({ example: 1 })
  version!: number;

  @ApiProperty({ example: '2026-08-01T00:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-08-01T00:00:00.000Z' })
  updatedAt!: string;
}

export class PaginatedMembershipPlansResponseDto {
  @ApiProperty({ type: [MembershipPlanResponseDto] })
  items!: MembershipPlanResponseDto[];

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
