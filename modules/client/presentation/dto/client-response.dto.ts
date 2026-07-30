import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Client } from '../../domain/aggregates/client.aggregate';

export class ClientResponseDto {
  @ApiProperty({ example: '550e8400-e29b-41d4-a716-446655440000' })
  id!: string;

  @ApiProperty({ example: 'CLI-2026-12345' })
  referenceNumber!: string;

  @ApiPropertyOptional({ example: '550e8400-e29b-41d4-a716-446655440000', nullable: true })
  identityId!: string | null;

  @ApiProperty({ example: 'John' })
  firstName!: string;

  @ApiProperty({ example: 'Doe' })
  lastName!: string;

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

  public static fromDomain(client: Client): ClientResponseDto {
    const dto = new ClientResponseDto();
    dto.id = client.id;
    dto.referenceNumber = client.referenceNumber.value;
    dto.identityId = client.identityId;
    dto.firstName = client.name.firstName;
    dto.lastName = client.name.lastName;
    dto.email = client.email.value;
    dto.phone = client.phone.value;
    dto.status = client.status;
    dto.version = client.version;
    dto.createdAt = client.createdAt;
    dto.updatedAt = client.updatedAt;
    return dto;
  }
}
