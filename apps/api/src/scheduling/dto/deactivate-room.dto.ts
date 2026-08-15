import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class DeactivateRoomRequestDto {
  @ApiPropertyOptional({
    description: 'Explanation reason for deactivating the room',
    example: 'Facility renovation',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Expected optimistic concurrency control version counter',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}
