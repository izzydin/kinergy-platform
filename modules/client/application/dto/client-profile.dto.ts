import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClientProfileDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'CLI-2026-12345' })
  referenceNumber!: string;

  @ApiProperty({ example: 'John' })
  firstName!: string;

  @ApiProperty({ example: 'Doe' })
  lastName!: string;

  @ApiProperty({ example: 'John Doe' })
  fullName!: string;

  @ApiProperty({ example: 'john.doe@example.com' })
  email!: string;

  @ApiProperty({ example: '+14155552671' })
  phone!: string;

  @ApiProperty({ example: 'ACTIVE' })
  status!: string;

  @ApiProperty({ example: 1 })
  version!: number;

  @ApiProperty({ example: '2026-07-30T12:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-07-30T12:00:00.000Z' })
  updatedAt!: Date;

  @ApiPropertyOptional({
    example: '550e8400-e29b-41d4-a716-446655440000',
    nullable: true,
    description: 'Linked user identity ID (only populated when context is authorized)',
  })
  identityId!: string | null;
}
