import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class SettlePaymentRequestDto {
  @ApiPropertyOptional({
    description:
      'Optional transaction trace or correlation reference returned by payment provider upon settlement.',
    example: 'QR-CONFIRMED-TRACE-12345',
    maxLength: 100,
  })
  @IsString()
  @IsOptional()
  @MaxLength(100, { message: 'Reference cannot exceed 100 characters.' })
  @Matches(/^[A-Za-z0-9#\-_/.: ]+$/, {
    message:
      'Reference contains prohibited characters. Only alphanumeric characters and safe punctuation (#, -, _, /, ., :, space) are permitted.',
  })
  reference?: string;
}

export class CancelPaymentRequestDto {
  @ApiPropertyOptional({
    description: 'Audit justification reason for voiding or cancelling the pending payment.',
    example: 'Customer opted to tender cash instead',
    maxLength: 255,
  })
  @IsString()
  @IsOptional()
  @MaxLength(255, { message: 'Cancellation reason cannot exceed 255 characters.' })
  reason?: string;
}
