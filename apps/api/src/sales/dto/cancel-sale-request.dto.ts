import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * Client request DTO for cancelling an active commercial agreement (POST /sales/:id/cancel).
 *
 * In accordance with ADR-0119, ADR-0135, and ADR-0136:
 * - Requires a non-empty audit justification reason explaining why the sale was cancelled.
 * - Enforces string type and maximum reason length of 255 characters.
 * - Prevents client from submitting status, payment modifications, or calculated totals.
 */
export class CancelSaleRequestDto {
  @ApiProperty({
    description: 'Mandatory non-empty audit justification reason for cancelling the Sale',
    example: 'Customer abandoned cart at register',
  })
  @IsString({ message: 'Cancellation reason must be a string.' })
  @IsNotEmpty({ message: 'Cancellation reason is required to cancel a Sale.' })
  @MaxLength(255, { message: 'Cancellation reason cannot exceed 255 characters.' })
  reason!: string;
}
