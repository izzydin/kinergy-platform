import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class SkipOccurrenceRequestDto {
  @ApiProperty({
    description: 'Zero-based occurrence index within the series to skip',
    example: 2,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  occurrenceIndex!: number;

  @ApiPropertyOptional({
    description: 'Optional clinical or administrative reason for skipping the slot',
    example: 'Client traveling out of town',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
