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
  PaymentRepositoryPort,
  SaleRepositoryPort,
  RecordPaymentHandler,
  GetPaymentByIdHandler,
  GetPaymentsBySaleIdHandler,
  SettlePaymentHandler,
  CancelPaymentHandler,
  RecordPaymentCommand,
  GetPaymentByIdQuery,
  GetPaymentsBySaleIdQuery,
  SettlePaymentCommand,
  CancelPaymentCommand,
  SalesApplicationResult,
} from '@kinergy-platform/core';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { Permissions, Roles, CurrentUser } from '../../platform/identity/decorators';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';
import {
  RecordPaymentRequestDto,
  PaymentResponseDto,
  SettlePaymentRequestDto,
  CancelPaymentRequestDto,
} from '../dto';
import { SalesExceptionFilter } from '../filters/sales-exception.filter';
import { SALE_REPOSITORY_TOKEN } from './sales.controller';

export const PAYMENT_REPOSITORY_TOKEN = 'PaymentRepositoryPort';

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@UseFilters(SalesExceptionFilter)
@Controller('api/v1')
export class PaymentsController {
  private readonly _recordPaymentHandler: RecordPaymentHandler;
  private readonly _getPaymentByIdHandler: GetPaymentByIdHandler;
  private readonly _getPaymentsBySaleIdHandler: GetPaymentsBySaleIdHandler;
  private readonly _settlePaymentHandler: SettlePaymentHandler;
  private readonly _cancelPaymentHandler: CancelPaymentHandler;

  constructor(
    @Inject(PAYMENT_REPOSITORY_TOKEN)
    paymentRepository: PaymentRepositoryPort,
    @Inject(SALE_REPOSITORY_TOKEN)
    saleRepository: SaleRepositoryPort,
    @Optional()
    @Inject(RecordPaymentHandler)
    recordPaymentHandler?: RecordPaymentHandler,
    @Optional()
    @Inject(GetPaymentByIdHandler)
    getPaymentByIdHandler?: GetPaymentByIdHandler,
    @Optional()
    @Inject(GetPaymentsBySaleIdHandler)
    getPaymentsBySaleIdHandler?: GetPaymentsBySaleIdHandler,
    @Optional()
    @Inject(SettlePaymentHandler)
    settlePaymentHandler?: SettlePaymentHandler,
    @Optional()
    @Inject(CancelPaymentHandler)
    cancelPaymentHandler?: CancelPaymentHandler,
  ) {
    this._recordPaymentHandler =
      recordPaymentHandler ?? new RecordPaymentHandler(paymentRepository, saleRepository);
    this._getPaymentByIdHandler =
      getPaymentByIdHandler ?? new GetPaymentByIdHandler(paymentRepository);
    this._getPaymentsBySaleIdHandler =
      getPaymentsBySaleIdHandler ??
      new GetPaymentsBySaleIdHandler(paymentRepository, saleRepository);
    this._settlePaymentHandler =
      settlePaymentHandler ?? new SettlePaymentHandler(paymentRepository, saleRepository);
    this._cancelPaymentHandler =
      cancelPaymentHandler ?? new CancelPaymentHandler(paymentRepository, saleRepository);
  }

  @Post('sales/:saleId/payments')
  @HttpCode(HttpStatus.CREATED)
  @Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')
  @Permissions('payments.create')
  @ApiOperation({
    summary: 'Record payment tender against a finalized commercial sale order',
    description:
      'Records cash or electronic payment against a sale in PENDING_PAYMENT or PARTIALLY_PAID status. Automatically coordinates Sale status transitions to PARTIALLY_PAID or PAID upon settlement.',
  })
  @ApiParam({ name: 'saleId', description: 'Sale UUID identifier' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: PaymentResponseDto,
    description: 'Payment recorded successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed, invalid tender method, or currency mismatch',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Target sale does not exist',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Sale is not in a payable status, or payment amount exceeds remaining balance',
  })
  public async recordPayment(
    @Param('saleId') saleId: string,
    @Body() dto: RecordPaymentRequestDto,
    @CurrentUser() user?: AuthenticatedUserPayload,
  ): Promise<PaymentResponseDto> {
    const command = new RecordPaymentCommand({
      saleId,
      amount: dto.amount,
      currency: dto.currency,
      method: dto.method,
      reference: dto.reference,
      tenantId: user?.tenantId ?? undefined,
      currentUser: user
        ? {
            id: user.id,
            roles: user.roles,
            permissions: user.permissions,
          }
        : undefined,
    });

    const result = await this._recordPaymentHandler.execute(command);
    return this.handleResult(result) as unknown as PaymentResponseDto;
  }

  @Get('sales/:saleId/payments')
  @HttpCode(HttpStatus.OK)
  @Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')
  @Permissions('payments.read')
  @ApiOperation({
    summary: 'List all payment transactions associated with a commercial sale',
    description:
      'Retrieves the chronological payment history for a given sale, allowing inspection of split tenders, partial payments, and settlements.',
  })
  @ApiParam({ name: 'saleId', description: 'Sale UUID identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: [PaymentResponseDto],
    description: 'List of payment records for the requested sale',
  })
  public async getPaymentsBySaleId(
    @Param('saleId') saleId: string,
    @CurrentUser() user?: AuthenticatedUserPayload,
  ): Promise<PaymentResponseDto[]> {
    const query = new GetPaymentsBySaleIdQuery({
      saleId,
      tenantId: user?.tenantId ?? undefined,
      currentUser: user
        ? {
            id: user.id,
            roles: user.roles,
            permissions: user.permissions,
          }
        : undefined,
    });

    const result = await this._getPaymentsBySaleIdHandler.execute(query);
    return this.handleResult(result) as unknown as PaymentResponseDto[];
  }

  @Get('payments/:paymentId')
  @HttpCode(HttpStatus.OK)
  @Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')
  @Permissions('payments.read')
  @ApiOperation({
    summary: 'Retrieve individual payment transaction by identifier',
    description:
      'Fetches a single payment record with full audit metadata, method, status, and structured monetary representation.',
  })
  @ApiParam({ name: 'paymentId', description: 'Payment UUID identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: PaymentResponseDto,
    description: 'Payment record resolved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment with specified ID does not exist',
  })
  public async getPaymentById(
    @Param('paymentId') paymentId: string,
    @CurrentUser() user?: AuthenticatedUserPayload,
  ): Promise<PaymentResponseDto> {
    const query = new GetPaymentByIdQuery({
      paymentId,
      tenantId: user?.tenantId ?? undefined,
      currentUser: user
        ? {
            id: user.id,
            roles: user.roles,
            permissions: user.permissions,
          }
        : undefined,
    });

    const result = await this._getPaymentByIdHandler.execute(query);
    return this.handleResult(result) as unknown as PaymentResponseDto;
  }

  @Post('payments/:id/settle')
  @HttpCode(HttpStatus.OK)
  @Roles('Owner', 'Manager', 'Receptionist')
  @Permissions('payments.create', 'payments.manage')
  @ApiOperation({
    summary: 'Confirm settlement of an unsettled pending payment transaction',
    description:
      'Transitions a PENDING payment to SETTLED, sets the definitive paidAt timestamp, and advances the parent Sale status if balance is satisfied.',
  })
  @ApiParam({ name: 'id', description: 'Pending Payment UUID identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: PaymentResponseDto,
    description: 'Payment settled successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment not found',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Payment is not in PENDING state (already settled, failed, or cancelled)',
  })
  public async settlePayment(
    @Param('id') id: string,
    @Body() dto: SettlePaymentRequestDto,
    @CurrentUser() user?: AuthenticatedUserPayload,
  ): Promise<PaymentResponseDto> {
    const command = new SettlePaymentCommand({
      paymentId: id,
      reference: dto.reference,
      tenantId: user?.tenantId ?? undefined,
      currentUser: user
        ? {
            id: user.id,
            roles: user.roles,
            permissions: user.permissions,
          }
        : undefined,
    });

    const result = await this._settlePaymentHandler.execute(command);
    return this.handleResult(result) as unknown as PaymentResponseDto;
  }

  @Post('payments/:id/cancel')
  @HttpCode(HttpStatus.OK)
  @Roles('Owner', 'Manager', 'Receptionist')
  @Permissions('payments.manage')
  @ApiOperation({
    summary: 'Void or cancel an unsettled pending payment transaction',
    description:
      'Transitions a PENDING payment to CANCELLED. Settled payments can never be cancelled in-place.',
  })
  @ApiParam({ name: 'id', description: 'Pending Payment UUID identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: PaymentResponseDto,
    description: 'Payment cancelled successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment not found',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Payment is already settled and cannot be cancelled',
  })
  public async cancelPayment(
    @Param('id') id: string,
    @Body() dto: CancelPaymentRequestDto,
    @CurrentUser() user?: AuthenticatedUserPayload,
  ): Promise<PaymentResponseDto> {
    const command = new CancelPaymentCommand({
      paymentId: id,
      reason: dto.reason,
      tenantId: user?.tenantId ?? undefined,
      currentUser: user
        ? {
            id: user.id,
            roles: user.roles,
            permissions: user.permissions,
          }
        : undefined,
    });

    const result = await this._cancelPaymentHandler.execute(command);
    return this.handleResult(result) as unknown as PaymentResponseDto;
  }

  private handleResult<T>(result: SalesApplicationResult<T, Error | string>): T {
    if (result.isFailure) {
      const error = result.getError();
      if (error instanceof Error) {
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
