import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  Sale,
  Money,
  Discount,
  SourceReference,
  SourceType,
  SaleMapper,
  SaleRepositoryInterface,
} from '@kinergy-platform/core';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { Permissions, Roles } from '../../platform/identity/decorators';
import {
  SaleResponseDto,
  CreateSaleRequestDto,
  AddSaleItemRequestDto,
  FinalizeSaleRequestDto,
} from '../dto';
import { SalesExceptionFilter } from '../filters/sales-exception.filter';

export const SALE_REPOSITORY_TOKEN = 'SaleRepositoryInterface';

@ApiTags('Sales')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@UseFilters(SalesExceptionFilter)
@Controller('api/v1/sales')
export class SalesController {
  constructor(
    @Inject(SALE_REPOSITORY_TOKEN)
    private readonly saleRepository: SaleRepositoryInterface,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')
  @Permissions('sales.create')
  @ApiOperation({
    summary: 'Create a new commercial checkout session in DRAFT status',
    description:
      'Initializes a deterministic sale agreement. Returns exact zero monetary totals (subtotal, discountTotal, total).',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: SaleResponseDto,
    description: 'Sale created successfully in DRAFT status',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed or invalid currency code',
  })
  public async createSale(@Body() dto: CreateSaleRequestDto): Promise<SaleResponseDto> {
    const currency = dto.currency ? dto.currency.trim().toUpperCase() : 'USD';

    const source = dto.source
      ? SourceReference.create({
          sourceType: dto.source.sourceType,
          sourceId: dto.source.sourceId,
          sourceCode: dto.source.sourceCode ?? null,
        })
      : SourceReference.create({
          sourceType: SourceType.CUSTOM_SERVICE,
          sourceId: 'pos_checkout_terminal',
          sourceCode: 'POS_REGISTER',
        });

    const sale = Sale.create({
      currency,
      clientId: dto.clientId,
      source,
    });

    await this.saleRepository.save(sale);
    return SaleMapper.toDTO(sale) as SaleResponseDto;
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('Owner', 'Manager', 'Receptionist', 'Trainer', 'Kitchen Staff')
  @Permissions('sales.read')
  @ApiOperation({
    summary: 'Get details of a specific sale order including exact monetary totals',
    description:
      'Exposes subtotal, discountTotal, and total with zero floating-point precision loss. Returns both structured Money and flat numeric summaries.',
  })
  @ApiParam({ name: 'id', description: 'Unique Sale ID (e.g. sale_01j9876543210abcdef)' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: SaleResponseDto,
    description: 'Sale retrieved successfully with complete monetary breakdown',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Sale order not found',
  })
  public async getSale(@Param('id') id: string): Promise<SaleResponseDto> {
    const sale = await this.saleRepository.findById(id);
    if (!sale) {
      throw new NotFoundException(`Sale order '${id}' was not found.`);
    }

    return SaleMapper.toDTO(sale) as SaleResponseDto;
  }

  @Post(':id/items')
  @HttpCode(HttpStatus.OK)
  @Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')
  @Permissions('sales.create')
  @ApiOperation({
    summary: 'Add a line item to a draft sale with unit price and optional discount',
    description:
      'Calculates line subtotal, line discount, and net line total using integer minor units. Updates parent Sale totals deterministically.',
  })
  @ApiParam({ name: 'id', description: 'Sale ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: SaleResponseDto,
    description: 'Line item added and totals recalculated deterministically',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid price, quantity, or excessive discount',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Sale already finalized (commercial lock violation)',
  })
  public async addItem(
    @Param('id') id: string,
    @Body() dto: AddSaleItemRequestDto,
  ): Promise<SaleResponseDto> {
    const sale = await this.saleRepository.findById(id);
    if (!sale) {
      throw new NotFoundException(`Sale order '${id}' was not found.`);
    }

    const source = SourceReference.create({
      sourceType: dto.source.sourceType,
      sourceId: dto.source.sourceId,
      sourceCode: dto.source.sourceCode ?? null,
    });

    const unitPrice = Money.create(dto.unitPriceAmount, sale.currency);

    let discount: Discount | undefined;
    if (dto.discount) {
      const typeStr = dto.discount.type.toUpperCase();
      if (typeStr === 'PERCENTAGE') {
        discount = Discount.percentage(dto.discount.value, dto.discount.reason);
      } else if (typeStr === 'FIXED' || typeStr === 'FIXED_AMOUNT') {
        discount = Discount.fixed(dto.discount.value, dto.discount.reason);
      } else {
        throw new BadRequestException(`Unsupported discount type: '${dto.discount.type}'.`);
      }
    }

    sale.addItem({
      source,
      description: dto.description,
      skuOrCode: dto.skuOrCode ?? null,
      quantity: dto.quantity,
      unitPrice,
      discount: discount ?? null,
    });

    await this.saleRepository.save(sale);
    return SaleMapper.toDTO(sale) as SaleResponseDto;
  }

  @Post(':id/finalize')
  @HttpCode(HttpStatus.OK)
  @Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')
  @Permissions('sales.create')
  @ApiOperation({
    summary: 'Finalize sale order and freeze commercial terms permanently',
    description:
      'Transitions sale from DRAFT to PENDING_PAYMENT. Invariant: Sale must have at least one line item. Once finalized, prices and discounts can never be modified.',
  })
  @ApiParam({ name: 'id', description: 'Sale ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: SaleResponseDto,
    description: 'Sale finalized and commercial terms permanently locked',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Sale has no line items (empty sale invariant violation)',
  })
  public async finalizeSale(
    @Param('id') id: string,
    @Body() _dto: FinalizeSaleRequestDto,
  ): Promise<SaleResponseDto> {
    const sale = await this.saleRepository.findById(id);
    if (!sale) {
      throw new NotFoundException(`Sale order '${id}' was not found.`);
    }

    sale.finalize();
    await this.saleRepository.save(sale);
    return SaleMapper.toDTO(sale) as SaleResponseDto;
  }
}
