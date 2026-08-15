import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CreateRoomRequestDto {
  @ApiProperty({
    description: 'Human-readable unique display name of the room',
    example: 'Hydrotherapy Suite 1',
  })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({
    description: 'Maximum client capacity of the room (default: 1)',
    example: 2,
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({
    description: 'Array of facility equipment and feature tags',
    example: ['hydrotherapy_tub', 'soundproof'],
    type: [String],
    default: [],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];
}
