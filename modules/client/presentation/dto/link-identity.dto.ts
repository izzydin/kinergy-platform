import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class LinkIdentityRequestDto {
  @ApiProperty({
    description: 'IAM Identity/User ID to link to the existing client profile',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  @IsNotEmpty()
  identityId!: string;
}
