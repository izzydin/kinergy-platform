import { ApiProperty } from '@nestjs/swagger';

export class TrainerDashboardSummaryResponseDto {
  @ApiProperty({
    description: 'The IAM User identifier of the trainer',
    example: 'usr_trainer_123',
  })
  trainerId!: string;

  @ApiProperty({
    description: 'Timestamp of the evaluation (ISO UTC format)',
    example: '2026-08-22T10:00:00.000Z',
  })
  asOf!: string;

  @ApiProperty({
    description: 'Lookahead horizon in days used for expiring membership count',
    example: 7,
  })
  horizonDays!: number;

  @ApiProperty({
    description: 'Total number of active/frozen clients currently assigned to this trainer',
    example: 24,
  })
  totalAssignedClients!: number;

  @ApiProperty({
    description: 'Total active memberships currently assigned to this trainer',
    example: 22,
  })
  activeMembershipsCount!: number;

  @ApiProperty({
    description: 'Total assigned memberships expiring within horizonDays',
    example: 3,
  })
  expiringMembershipsCount!: number;

  @ApiProperty({
    description: 'Total assigned memberships currently in frozen status',
    example: 2,
  })
  frozenMembershipsCount!: number;

  @ApiProperty({
    description: "Total check-in arrivals for this trainer's assigned clients today",
    example: 8,
  })
  todayCheckInsCount!: number;
}
