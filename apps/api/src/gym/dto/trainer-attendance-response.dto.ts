import { ApiProperty } from '@nestjs/swagger';
import { AccessResult, CheckInMethod } from '@kinergy-platform/core';

export class TrainerAttendanceItemDto {
  @ApiProperty({ example: 'att_123' })
  id!: string;

  @ApiProperty({ example: 'client_456' })
  clientId!: string;

  @ApiProperty({ example: 'mem_789', nullable: true })
  membershipId!: string | null;

  @ApiProperty({ example: '2026-08-22T08:30:00.000Z' })
  checkInTime!: string;

  @ApiProperty({ example: '2026-08-22' })
  gymDay!: string;

  @ApiProperty({ enum: CheckInMethod, example: CheckInMethod.RFID })
  method!: CheckInMethod;

  @ApiProperty({ enum: AccessResult, example: AccessResult.GRANTED })
  result!: AccessResult;

  @ApiProperty({ example: 'gate_1', nullable: true })
  gateId!: string | null;
}

export class TrainerAttendanceResponseDto {
  @ApiProperty({ type: [TrainerAttendanceItemDto] })
  items!: TrainerAttendanceItemDto[];

  @ApiProperty({ example: 8 })
  total!: number;

  @ApiProperty({ example: 8 })
  grantedCount!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 1 })
  totalPages!: number;
}
