import { ApiProperty } from '@nestjs/swagger';

export class ExpiringMembershipItemResponseDto {
  @ApiProperty({ example: 'mem_123' })
  membershipId!: string;

  @ApiProperty({ example: 'client_456' })
  clientId!: string;

  @ApiProperty({ example: 'plan_standard_monthly' })
  planId!: string;

  @ApiProperty({ example: '2026-08-25T00:00:00.000Z' })
  endDate!: string;

  @ApiProperty({ example: 3 })
  daysRemaining!: number;

  @ApiProperty({ example: true })
  isExpiringSoon!: boolean;
}

export class ExpiringMembershipsResponseDto {
  @ApiProperty({ type: [ExpiringMembershipItemResponseDto] })
  items!: ExpiringMembershipItemResponseDto[];

  @ApiProperty({ example: 3 })
  total!: number;

  @ApiProperty({ example: 7 })
  horizonDays!: number;
}
