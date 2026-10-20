import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { UserStatus } from '../../domain/user-status.enum';

export class CreateUserRequestDto {
  @ApiProperty({
    description: 'Unique user primary email address',
    example: 'jane.doe@example.com',
  })
  @IsEmail({}, { message: 'Invalid email address format.' })
  @IsNotEmpty({ message: 'Email address is required.' })
  email!: string;

  @ApiPropertyOptional({
    description:
      'Initial plaintext password. If omitted, a secure temporary password is generated.',
    example: 'SecurePass123!',
  })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiPropertyOptional({
    description: 'User display name',
    example: 'Jane Doe',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Initial system role assigned to the user',
    example: 'ADMIN',
    default: 'USER',
  })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({
    description: 'Tenant identifier for multi-tenant isolation',
    example: 'tenant_main',
  })
  @IsOptional()
  @IsString()
  tenantId?: string | null;

  @ApiPropertyOptional({
    description: 'Initial user status',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class UpdateUserRequestDto {
  @ApiPropertyOptional({
    description: 'Updated user primary email address',
    example: 'new.email@example.com',
  })
  @IsOptional()
  @IsEmail({}, { message: 'Invalid email address format.' })
  email?: string;

  @ApiPropertyOptional({
    description: 'Updated user display name',
    example: 'Jane Smith',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Updated system role assigned to the user',
    example: 'OPERATOR',
  })
  @IsOptional()
  @IsString()
  role?: string;
}

export class SearchUsersQueryRequestDto {
  @ApiPropertyOptional({
    description: 'Email substring filter',
    example: 'admin@kinergy.test',
  })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({
    description: 'General query term matching email (frontend alias)',
    example: 'admin',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({
    description: 'Role filter matching user roles',
    example: 'ADMIN',
  })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({
    description: 'Lifecycle status filter',
    enum: UserStatus,
    example: UserStatus.ACTIVE,
  })
  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @ApiPropertyOptional({
    description: '1-indexed page number for pagination',
    default: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Items per page limit (min: 1, max: 100)',
    default: 10,
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({
    description: 'Sort ordering directive (e.g. name.desc, email.asc)',
    example: 'name.asc',
  })
  @IsOptional()
  @IsString()
  sort?: string;
}
