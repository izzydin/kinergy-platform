import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterClientRequestDto {
  @ApiProperty({
    description: 'First name of the client',
    example: 'John',
  })
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty({
    description: 'Last name of the client',
    example: 'Doe',
  })
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiProperty({
    description: 'Email address of the client',
    example: 'john.doe@example.com',
  })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiProperty({
    description: 'Phone number in E.164 or local format',
    example: '+14155552671',
  })
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @ApiPropertyOptional({
    description: 'Optional IAM User Identity ID to link immediately upon registration',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  @IsOptional()
  @IsString()
  identityId?: string;

  @ApiPropertyOptional({
    description: 'If true, soft duplicate warnings are ignored and client registration proceeds',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  bypassSoftDuplicates?: boolean;
}
