import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { SourceType } from '@kinergy-platform/core';

export { SourceReferenceInputDto } from './source-reference.dto';

export class ItemSourceInputDto {
  @ApiPropertyOptional({
    enum: SourceType,
    description: 'Catalog origin category',
    example: SourceType.INVENTORY_ITEM,
  })
  @IsEnum(SourceType)
  @IsOptional()
  sourceType?: SourceType;

  @ApiPropertyOptional({
    description: 'Identifier of catalog origin entity',
    example: 'inv_123',
  })
  @IsString()
  @IsOptional()
  sourceId?: string;

  @ApiPropertyOptional({
    description: 'Business catalog code',
    example: 'PROTEIN_1KG',
  })
  @IsString()
  @IsOptional()
  sourceCode?: string;
}

export class ItemDiscountInputDto {
  @ApiProperty({
    description: 'Discount type (FIXED or PERCENTAGE)',
    example: 'PERCENTAGE',
  })
  @IsString()
  @IsNotEmpty()
  type!: string;

  @ApiProperty({
    description:
      'Discount value (0-100 for percentage, or non-negative fixed amount with up to 2 decimal places)',
    example: 15,
  })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  value!: number;

  @ApiPropertyOptional({
    description: 'Commercial justification reason',
    example: 'VIP Membership Promo',
  })
  @IsString()
  @IsOptional()
  reason?: string;
}

export { ApplySaleDiscountRequestDto } from './apply-sale-discount-request.dto';

export class FinalizeSaleRequestDto {
  @ApiPropertyOptional({
    description: 'Optional cashier notes upon finalization',
    example: 'Checked out at Front Desk Terminal 1',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}

export class CancelSaleRequestDto {
  @ApiProperty({
    description: 'Audit justification reason for cancelling the Sale',
    example: 'Customer abandoned cart at register',
  })
  @IsString()
  @IsNotEmpty({ message: 'Cancellation reason is required to cancel a Sale.' })
  reason!: string;
}

export class CoordinateSalePaymentRequestDto {
  @ApiProperty({
    description: 'UUID of the completed payment to coordinate against the Sale',
    example: 'pay_01j9876543210abcdef',
  })
  @IsString()
  @IsNotEmpty({ message: 'Payment ID cannot be empty.' })
  paymentId!: string;
}
