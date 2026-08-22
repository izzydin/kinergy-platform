import { ApiProperty } from '@nestjs/swagger';

export class AssignedClientMembershipItemDto {
  @ApiProperty({ example: 'mem_123' })
  membershipId!: string;

  @ApiProperty({ example: 'client_456' })
  clientId!: string;

  @ApiProperty({ example: 'plan_standard_monthly' })
  planId!: string;

  @ApiProperty({ example: 'Standard Monthly Pass' })
  planName!: string;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiProperty({ example: '2026-08-01T00:00:00.000Z' })
  startDate!: string;

  @ApiProperty({ example: '2026-09-01T00:00:00.000Z' })
  endDate!: string;

  @ApiProperty({ example: 10 })
  daysRemaining!: number;

  @ApiProperty({ example: false })
  isExpiringSoon!: boolean;

  @ApiProperty({ example: false })
  isExpired!: boolean;

  @ApiProperty({ example: false })
  isCurrentlyFrozen!: boolean;

  @ApiProperty({ example: '2026-08-01T00:00:00.000Z' })
  assignedAt!: string;
}

export class PaginatedAssignedClientsResponseDto {
  @ApiProperty({ type: [AssignedClientMembershipItemDto] })
  items!: AssignedClientMembershipItemDto[];

  @ApiProperty({ example: 45 })
  totalItems!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;

  @ApiProperty({ example: true })
  hasNextPage!: boolean;

  @ApiProperty({ example: false })
  hasPreviousPage!: boolean;
}
