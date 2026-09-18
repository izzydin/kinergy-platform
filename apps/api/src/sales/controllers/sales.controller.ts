import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Post,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  SourceType,
  SaleRepositoryInterface,
  CreateSaleHandler,
  GetSaleByIdHandler,
  AddSaleItemHandler,
  FinalizeSaleHandler,
  CreateSaleCommand,
  GetSaleByIdQuery,
  AddSaleItemCommand,
  FinalizeSaleCommand,
  SalesApplicationResult,
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
  private readonly _createSaleHandler: CreateSaleHandler;
  private readonly _getSaleByIdHandler: GetSaleByIdHandler;
  private readonly _addSaleItemHandler: AddSaleItemHandler;
  private readonly _finalizeSaleHandler: FinalizeSaleHandler;

  constructor(
    @Inject(SALE_REPOSITORY_TOKEN)
    saleRepository: SaleRepositoryInterface,
    @Optional()
    @Inject(CreateSaleHandler)
    createSaleHandler?: CreateSaleHandler,
    @Optional()
    @Inject(GetSaleByIdHandler)
    getSaleByIdHandler?: GetSaleByIdHandler,
    @Optional()
    @Inject(AddSaleItemHandler)
    addSaleItemHandler?: AddSaleItemHandler,
    @Optional()
    @Inject(FinalizeSaleHandler)
    finalizeSaleHandler?: FinalizeSaleHandler,
  ) {
    this._createSaleHandler = createSaleHandler ?? new CreateSaleHandler(saleRepository);
    this._getSaleByIdHandler = getSaleByIdHandler ?? new GetSaleByIdHandler(saleRepository);
    this._addSaleItemHandler = addSaleItemHandler ?? new AddSaleItemHandler(saleRepository);
    this._finalizeSaleHandler = finalizeSaleHandler ?? new FinalizeSaleHandler(saleRepository);
  }

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
    const command = new CreateSaleCommand({
      currency: dto.currency,
      clientId: dto.clientId,
      source: dto.source
        ? {
            sourceType: dto.source.sourceType,
            sourceId: dto.source.sourceId,
            sourceCode: dto.source.sourceCode,
          }
        : {
            sourceType: SourceType.CUSTOM_SERVICE,
            sourceId: 'pos_checkout_terminal',
            sourceCode: 'POS_REGISTER',
          },
    });

    const result = await this._createSaleHandler.execute(command);
    return this.handleResult(result) as SaleResponseDto;
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
    const query = new GetSaleByIdQuery({ saleId: id });
    const result = await this._getSaleByIdHandler.execute(query);
    return this.handleResult(result) as SaleResponseDto;
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
    const command = new AddSaleItemCommand({
      saleId: id,
      source: {
        sourceType: dto.source.sourceType,
        sourceId: dto.source.sourceId,
        sourceCode: dto.source.sourceCode,
      },
      description: dto.description,
      skuOrCode: dto.skuOrCode,
      quantity: dto.quantity,
      unitPriceAmount: dto.unitPriceAmount,
      discount: dto.discount
        ? {
            type: dto.discount.type,
            value: dto.discount.value,
            reason: dto.discount.reason,
          }
        : undefined,
    });

    const result = await this._addSaleItemHandler.execute(command);
    return this.handleResult(result) as SaleResponseDto;
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
    const command = new FinalizeSaleCommand({ saleId: id });
    const result = await this._finalizeSaleHandler.execute(command);
    return this.handleResult(result) as SaleResponseDto;
  }

  private handleResult<T>(result: SalesApplicationResult<T, Error | string>): T {
    if (result.isFailure) {
      const error = result.getError();
      if (error instanceof Error) {
        if (error.message.includes('not found') || error.message.includes('was not found')) {
          throw new NotFoundException(error.message);
        }
        throw error;
      }
      const message = String(error);
      if (message.includes('not found') || message.includes('was not found')) {
        throw new NotFoundException(message);
      }
      throw new BadRequestException(message);
    }
    return result.getValue();
  }
}
