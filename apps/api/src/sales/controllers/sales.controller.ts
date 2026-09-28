import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
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
  PaymentRepositoryPort,
  CreateSaleHandler,
  GetSaleByIdHandler,
  AddSaleItemHandler,
  RemoveSaleItemHandler,
  ApplyOrderDiscountHandler,
  RemoveOrderDiscountHandler,
  FinalizeSaleHandler,
  CancelSaleHandler,
  CoordinateSalePaymentHandler,
  CreateSaleCommand,
  GetSaleByIdQuery,
  AddSaleItemCommand,
  RemoveSaleItemCommand,
  ApplyOrderDiscountCommand,
  RemoveOrderDiscountCommand,
  FinalizeSaleCommand,
  CancelSaleCommand,
  CoordinateSalePaymentCommand,
  SalesApplicationResult,
  DuplicateSaleException,
} from '@kinergy-platform/core';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { Permissions, Roles } from '../../platform/identity/decorators';
import {
  SaleResponseDto,
  CreateSaleRequestDto,
  AddSaleItemRequestDto,
  FinalizeSaleRequestDto,
  ApplySaleDiscountRequestDto,
  CancelSaleRequestDto,
  CoordinateSalePaymentRequestDto,
} from '../dto';
import { SalesExceptionFilter } from '../filters/sales-exception.filter';
import { PAYMENT_REPOSITORY_TOKEN } from './payments.controller';

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
  private readonly _removeSaleItemHandler: RemoveSaleItemHandler;
  private readonly _applyOrderDiscountHandler: ApplyOrderDiscountHandler;
  private readonly _removeOrderDiscountHandler: RemoveOrderDiscountHandler;
  private readonly _finalizeSaleHandler: FinalizeSaleHandler;
  private readonly _cancelSaleHandler: CancelSaleHandler;
  private readonly _coordinateSalePaymentHandler?: CoordinateSalePaymentHandler;

  constructor(
    @Inject(SALE_REPOSITORY_TOKEN)
    saleRepository: SaleRepositoryInterface,
    @Optional()
    @Inject(PAYMENT_REPOSITORY_TOKEN)
    paymentRepository?: PaymentRepositoryPort,
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
    @Inject(RemoveSaleItemHandler)
    removeSaleItemHandler?: RemoveSaleItemHandler,
    @Optional()
    @Inject(ApplyOrderDiscountHandler)
    applyOrderDiscountHandler?: ApplyOrderDiscountHandler,
    @Optional()
    @Inject(RemoveOrderDiscountHandler)
    removeOrderDiscountHandler?: RemoveOrderDiscountHandler,
    @Optional()
    @Inject(FinalizeSaleHandler)
    finalizeSaleHandler?: FinalizeSaleHandler,
    @Optional()
    @Inject(CancelSaleHandler)
    cancelSaleHandler?: CancelSaleHandler,
    @Optional()
    @Inject(CoordinateSalePaymentHandler)
    coordinateSalePaymentHandler?: CoordinateSalePaymentHandler,
  ) {
    this._createSaleHandler = createSaleHandler ?? new CreateSaleHandler(saleRepository);
    this._getSaleByIdHandler = getSaleByIdHandler ?? new GetSaleByIdHandler(saleRepository);
    this._addSaleItemHandler = addSaleItemHandler ?? new AddSaleItemHandler(saleRepository);
    this._removeSaleItemHandler =
      removeSaleItemHandler ?? new RemoveSaleItemHandler(saleRepository);
    this._applyOrderDiscountHandler =
      applyOrderDiscountHandler ?? new ApplyOrderDiscountHandler(saleRepository);
    this._removeOrderDiscountHandler =
      removeOrderDiscountHandler ?? new RemoveOrderDiscountHandler(saleRepository);
    this._finalizeSaleHandler = finalizeSaleHandler ?? new FinalizeSaleHandler(saleRepository);
    this._cancelSaleHandler = cancelSaleHandler ?? new CancelSaleHandler(saleRepository);

    if (coordinateSalePaymentHandler) {
      this._coordinateSalePaymentHandler = coordinateSalePaymentHandler;
    } else if (paymentRepository) {
      this._coordinateSalePaymentHandler = new CoordinateSalePaymentHandler(
        saleRepository,
        paymentRepository,
      );
    }
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
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Duplicate Sale or conflicting transaction detected',
  })
  public async createSale(
    @Body() dto: CreateSaleRequestDto,
    @Headers('x-idempotency-key') idempotencyKeyHeader?: string,
  ): Promise<SaleResponseDto> {
    const command = new CreateSaleCommand({
      id: dto.id,
      idempotencyKey: dto.idempotencyKey || idempotencyKeyHeader,
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

  @Delete(':id/items/:itemId')
  @HttpCode(HttpStatus.OK)
  @Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')
  @Permissions('sales.create')
  @ApiOperation({
    summary: 'Remove a line item from a draft sale',
    description:
      'Removes specified item and recalculates authoritative financial totals. Permitted only in DRAFT status.',
  })
  @ApiParam({ name: 'id', description: 'Sale ID' })
  @ApiParam({ name: 'itemId', description: 'SaleItem ID to remove' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: SaleResponseDto,
    description: 'Line item removed and totals recalculated deterministically',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Sale or line item not found',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Sale already finalized or cancelled',
  })
  public async removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ): Promise<SaleResponseDto> {
    const command = new RemoveSaleItemCommand({
      saleId: id,
      itemId,
    });

    const result = await this._removeSaleItemHandler.execute(command);
    return this.handleResult(result) as SaleResponseDto;
  }

  @Post(':id/discount')
  @HttpCode(HttpStatus.OK)
  @Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')
  @Permissions('sales.create')
  @ApiOperation({
    summary: 'Apply an order-level discount to a draft sale',
    description:
      'Applies a percentage or fixed discount to the overall order. Recalculates discountTotal and total deterministically. Permitted only in DRAFT status.',
  })
  @ApiParam({ name: 'id', description: 'Sale ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: SaleResponseDto,
    description: 'Discount applied and totals recalculated deterministically',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid discount type or value',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Sale already finalized or cancelled',
  })
  public async applyDiscount(
    @Param('id') id: string,
    @Body() dto: ApplySaleDiscountRequestDto,
  ): Promise<SaleResponseDto> {
    const command = new ApplyOrderDiscountCommand({
      saleId: id,
      discount: {
        type: dto.type,
        value: dto.value,
        reason: dto.reason,
      },
    });

    const result = await this._applyOrderDiscountHandler.execute(command);
    return this.handleResult(result) as SaleResponseDto;
  }

  @Delete(':id/discount')
  @HttpCode(HttpStatus.OK)
  @Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')
  @Permissions('sales.create')
  @ApiOperation({
    summary: 'Remove the order-level discount from a draft sale',
    description:
      'Removes the order discount and recalculates discountTotal and total. Permitted only in DRAFT status.',
  })
  @ApiParam({ name: 'id', description: 'Sale ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: SaleResponseDto,
    description: 'Order discount removed and totals recalculated deterministically',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Sale already finalized or cancelled',
  })
  public async removeDiscount(@Param('id') id: string): Promise<SaleResponseDto> {
    const command = new RemoveOrderDiscountCommand({
      saleId: id,
    });

    const result = await this._removeOrderDiscountHandler.execute(command);
    return this.handleResult(result) as SaleResponseDto;
  }

  @Post([':id/finalize', ':id/submit-for-payment'])
  @HttpCode(HttpStatus.OK)
  @Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')
  @Permissions('sales.create')
  @ApiOperation({
    summary: 'Submit sale for payment and freeze commercial terms permanently',
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
    @Body() _dto: FinalizeSaleRequestDto = {},
  ): Promise<SaleResponseDto> {
    const command = new FinalizeSaleCommand({ saleId: id });
    const result = await this._finalizeSaleHandler.execute(command);
    return this.handleResult(result) as SaleResponseDto;
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')
  @Permissions('sales.create')
  @ApiOperation({
    summary: 'Cancel an active sale order (DRAFT, PENDING_PAYMENT, or PARTIALLY_PAID)',
    description:
      'Transitions sale to terminal CANCELLED status with audit justification reason. Once cancelled, the sale becomes permanently immutable.',
  })
  @ApiParam({ name: 'id', description: 'Sale ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: SaleResponseDto,
    description: 'Sale cancelled successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Cancellation reason is missing or empty',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Sale cannot be cancelled (e.g. already PAID, COMPLETED, or CANCELLED)',
  })
  public async cancelSale(
    @Param('id') id: string,
    @Body() dto: CancelSaleRequestDto,
  ): Promise<SaleResponseDto> {
    const command = new CancelSaleCommand({
      saleId: id,
      reason: dto.reason,
    });

    const result = await this._cancelSaleHandler.execute(command);
    return this.handleResult(result) as SaleResponseDto;
  }

  @Post(':id/coordinate-payment')
  @HttpCode(HttpStatus.OK)
  @Roles('Owner', 'Manager', 'Receptionist')
  @Permissions('sales.create', 'payments.manage')
  @ApiOperation({
    summary: 'Coordinate verified Payment settlement against the Sale',
    description:
      'Synchronizes Sale payment status based on authoritative Payment aggregate state. Invariant: Sale cannot be marked PAID without a valid completed Payment.',
  })
  @ApiParam({ name: 'id', description: 'Sale ID' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: SaleResponseDto,
    description: 'Payment coordinated and Sale status advanced',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Payment does not belong to Sale, currency mismatch, or insufficient funds',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Payment not in COMPLETED status or Sale not payable',
  })
  public async coordinatePayment(
    @Param('id') id: string,
    @Body() dto: CoordinateSalePaymentRequestDto,
  ): Promise<SaleResponseDto> {
    if (!this._coordinateSalePaymentHandler) {
      throw new BadRequestException('Payment coordination service is unavailable.');
    }

    const command = new CoordinateSalePaymentCommand({
      saleId: id,
      paymentId: dto.paymentId,
    });

    const result = await this._coordinateSalePaymentHandler.execute(command);
    return this.handleResult(result) as SaleResponseDto;
  }

  private handleResult<T>(result: SalesApplicationResult<T, Error | string>): T {
    if (result.isFailure) {
      const error = result.getError();
      if (error instanceof Error) {
        if (error instanceof DuplicateSaleException || error.name === 'DuplicateSaleException') {
          throw new ConflictException(error.message);
        }
        if (error.message.includes('not found') || error.message.includes('was not found')) {
          throw new NotFoundException(error.message);
        }
        throw error;
      }
      const message = String(error);
      if (message.includes('Duplicate') || message.includes('already exists')) {
        throw new ConflictException(message);
      }
      if (message.includes('not found') || message.includes('was not found')) {
        throw new NotFoundException(message);
      }
      throw new BadRequestException(message);
    }
    return result.getValue();
  }
}
