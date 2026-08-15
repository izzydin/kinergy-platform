import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class ListRoomsQueryDto {
  @ApiPropertyOptional({
    description: 'Filter rooms by operational status (AVAILABLE, UNAVAILABLE, MAINTENANCE)',
    example: 'AVAILABLE',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter rooms requiring specific feature tags',
    example: ['hydrotherapy_tub'],
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map((s) => s.trim());
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  features?: string[];

  @ApiPropertyOptional({
    description: 'Filter rooms by minimum client capacity',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  minCapacity?: number;
}
