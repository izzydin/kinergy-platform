import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CancelRecurrenceSeriesRequestDto {
  @ApiPropertyOptional({
    description: 'Clinical / administrative reason for series cancellation',
    example: 'Client completed treatment course ahead of schedule',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
