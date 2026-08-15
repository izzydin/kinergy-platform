import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MaintenanceWindowResponseDto {
  @ApiProperty({
    description: 'Unique identifier of the maintenance window',
    example: 'maint_1723700000_abc123',
  })
  id!: string;

  @ApiPropertyOptional({
    description: 'Identifier of the associated room',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  roomId?: string;

  @ApiProperty({
    description: 'ISO 8601 UTC start timestamp',
    example: '2026-09-01T12:00:00.000Z',
  })
  startTime!: string;

  @ApiProperty({
    description: 'ISO 8601 UTC end timestamp',
    example: '2026-09-01T14:00:00.000Z',
  })
  endTime!: string;

  @ApiProperty({
    description: 'Explanation reason for the maintenance block',
    example: 'Water filtration system maintenance',
  })
  reason!: string;

  @ApiProperty({
    description: 'ISO 8601 creation timestamp',
    example: '2026-08-15T08:00:00.000Z',
  })
  createdAt!: string;
}

export class RoomResponseDto {
  @ApiProperty({
    description: 'Unique Room identifier',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  id!: string;

  @ApiProperty({
    description: 'Human-readable unique display name',
    example: 'Hydrotherapy Suite 1',
  })
  name!: string;

  @ApiProperty({
    description: 'Maximum client capacity',
    example: 2,
  })
  capacity!: number;

  @ApiProperty({
    description: 'Operational status (AVAILABLE, UNAVAILABLE, MAINTENANCE)',
    example: 'AVAILABLE',
  })
  status!: string;

  @ApiProperty({
    description: 'Resource type taxonomy',
    example: 'ROOM',
  })
  resourceType!: string;

  @ApiProperty({
    description: 'Array of facility feature tags',
    example: ['hydrotherapy_tub', 'soundproof'],
    type: [String],
  })
  features!: string[];

  @ApiPropertyOptional({
    description: 'Unavailability or maintenance explanation reason',
    example: 'Deep sanitization in progress',
  })
  maintenanceReason?: string;

  @ApiProperty({
    description: 'Array of scheduled temporal maintenance windows',
    type: [MaintenanceWindowResponseDto],
  })
  maintenanceWindows!: MaintenanceWindowResponseDto[];

  @ApiProperty({
    description: 'Optimistic concurrency control version counter',
    example: 1,
  })
  version!: number;

  @ApiProperty({
    description: 'ISO 8601 creation timestamp',
    example: '2026-08-15T08:00:00.000Z',
  })
  createdAt!: string;

  @ApiProperty({
    description: 'ISO 8601 last update timestamp',
    example: '2026-08-15T08:00:00.000Z',
  })
  updatedAt!: string;
}

export class RoomAvailabilityResponseDto {
  @ApiProperty({
    description: 'Boolean indicating if the requested room/window is available without conflict',
    example: true,
  })
  isAvailable!: boolean;

  @ApiPropertyOptional({
    description: 'Room identifier if queried for a specific room',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  roomId?: string;

  @ApiProperty({
    description: 'List of available Room candidates matching requested parameters',
    type: [RoomResponseDto],
  })
  availableRooms!: RoomResponseDto[];

  @ApiProperty({
    description: 'List of conflict explanation descriptions if unavailable',
    example: [],
    type: [String],
  })
  conflicts!: string[];
}
