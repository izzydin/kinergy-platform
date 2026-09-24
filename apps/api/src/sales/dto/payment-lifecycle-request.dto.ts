import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export class SettlePaymentRequestDto {
  @ApiPropertyOptional({
    description:
      'Optional transaction trace or correlation reference returned by payment provider upon settlement. Note: status, paidAt, and createdAt are strictly domain-managed and cannot be supplied by clients.',
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

/**
 * Request DTO alias for CompletePaymentRequest to support canonical completion nomenclature.
 */
export class CompletePaymentRequestDto extends SettlePaymentRequestDto {}

export class CancelPaymentRequestDto {
  @ApiPropertyOptional({
    description:
      'Audit justification reason for voiding or cancelling the pending payment. Note: status, paidAt, and createdAt are strictly domain-managed and cannot be supplied by clients.',
    example: 'Customer opted to tender cash instead',
    maxLength: 255,
  })
  @IsString()
  @IsOptional()
  @MaxLength(255, { message: 'Cancellation reason cannot exceed 255 characters.' })
  reason?: string;
}

export class FailPaymentRequestDto {
  @ApiPropertyOptional({
    description:
      'Audit justification reason for payment decline, rejection, or rail timeout. Note: status, paidAt, and createdAt are strictly domain-managed and cannot be supplied by clients.',
    example: 'Bank card decline: insufficient funds',
    maxLength: 255,
  })
  @IsString()
  @IsOptional()
  @MaxLength(255, { message: 'Failure reason cannot exceed 255 characters.' })
  reason?: string;
}
