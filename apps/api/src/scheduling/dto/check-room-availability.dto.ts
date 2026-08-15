import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { IsArray, IsISO8601, IsInt, IsNotEmpty, IsOptional, IsString, Min } from 'class-validator';

export class CheckRoomAvailabilityQueryDto {
  @ApiProperty({
    description: 'ISO 8601 UTC start timestamp of the requested window',
    example: '2026-09-01T10:00:00.000Z',
  })
  @IsISO8601()
  @IsNotEmpty()
  startTime!: string;

  @ApiProperty({
    description: 'ISO 8601 UTC end timestamp of the requested window',
    example: '2026-09-01T11:00:00.000Z',
  })
  @IsISO8601()
  @IsNotEmpty()
  endTime!: string;

  @ApiPropertyOptional({
    description: 'Optional target Room ID to check specific availability',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  @IsOptional()
  @IsString()
  roomId?: string;

  @ApiPropertyOptional({
    description: 'Optional comma-separated list or array of required facility features',
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
  requiredFeatures?: string[];

  @ApiPropertyOptional({
    description: 'Optional minimum client capacity required',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  requiredCapacity?: number;
}
