import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class EditRoomRequestDto {
  @ApiPropertyOptional({
    description: 'Updated display name of the room',
    example: 'Hydrotherapy Suite 1 - Renamed',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Updated maximum client capacity',
    example: 3,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;

  @ApiPropertyOptional({
    description: 'Updated array of facility feature tags',
    example: ['hydrotherapy_tub', 'soundproof', 'chromotherapy'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({
    description: 'Expected optimistic concurrency control version counter',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}
