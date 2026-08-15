import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Min } from 'class-validator';

export class ActivateRoomRequestDto {
  @ApiPropertyOptional({
    description: 'Expected optimistic concurrency control version counter',
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  expectedVersion?: number;
}
