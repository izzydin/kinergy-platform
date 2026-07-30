import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ClientTimelineEntry } from '../../domain/read-models/client-timeline-entry.entity';

export class ClientTimelineEntryDto {
  @ApiProperty({
    description: 'Timeline entry unique identifier',
    example: 'd3b07384-d113-46e4-a106-932d431d15c7',
  })
  id!: string;

  @ApiProperty({
    description: 'Target client ID',
    example: '9b1deb4d-3b7d-416b-9548-52ee8c8230e5',
  })
  clientId!: string;

  @ApiProperty({ description: 'Source module origin', example: 'CLIENT' })
  sourceModule!: string;

  @ApiProperty({ description: 'Canonical event type', example: 'CLIENT_CREATED' })
  eventType!: string;

  @ApiProperty({
    description: 'Human-readable activity summary',
    example: 'Client account registered',
  })
  summary!: string;

  @ApiPropertyOptional({
    description: 'Event context metadata',
    example: { referenceNumber: 'CLI-2026-00001' },
  })
  metadata!: Record<string, unknown>;

  @ApiProperty({
    description: 'Timestamp when event occurred',
    example: '2026-07-30T12:00:00.000Z',
  })
  occurredAt!: Date;

  static fromDomain(entry: ClientTimelineEntry): ClientTimelineEntryDto {
    const dto = new ClientTimelineEntryDto();
    dto.id = entry.id;
    dto.clientId = entry.clientId;
    dto.sourceModule = entry.sourceModule;
    dto.eventType = entry.eventType;
    dto.summary = entry.summary;
    dto.metadata = entry.metadata;
    dto.occurredAt = entry.occurredAt;
    return dto;
  }
}
