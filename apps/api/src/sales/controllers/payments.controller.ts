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
  Query,
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
  CompletePaymentHandler,
  SettlePaymentHandler,
  FailPaymentHandler,
  CancelPaymentHandler,
  RecordPaymentCommand,
  GetPaymentByIdQuery,
  GetPaymentsBySaleIdQuery,
  CompletePaymentCommand,
  SettlePaymentCommand,
  FailPaymentCommand,
  CancelPaymentCommand,
  SalesApplicationResult,
} from '@kinergy-platform/core';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { Permissions, Roles, CurrentUser } from '../../platform/identity/decorators';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import { RequestContext } from '../../platform/identity/request-context';
import {
  RecordPaymentRequestDto,
  PaymentResponseDto,
  CompletePaymentRequestDto,
  SettlePaymentRequestDto,
  FailPaymentRequestDto,
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
  private readonly _completePaymentHandler: CompletePaymentHandler;
  private readonly _settlePaymentHandler: SettlePaymentHandler;
  private readonly _failPaymentHandler: FailPaymentHandler;
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
    @Inject(CompletePaymentHandler)
    completePaymentHandler?: CompletePaymentHandler,
    @Optional()
    @Inject(SettlePaymentHandler)
    settlePaymentHandler?: SettlePaymentHandler,
    @Optional()
    @Inject(FailPaymentHandler)
    failPaymentHandler?: FailPaymentHandler,
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
    this._completePaymentHandler =
      completePaymentHandler ??
      settlePaymentHandler ??
      new CompletePaymentHandler(paymentRepository, saleRepository);
    this._settlePaymentHandler =
      settlePaymentHandler ??
      (this._completePaymentHandler as SettlePaymentHandler) ??
      new SettlePaymentHandler(paymentRepository, saleRepository);
    this._failPaymentHandler =
      failPaymentHandler ?? new FailPaymentHandler(paymentRepository, saleRepository);
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
    const userContext = user
      ? new AuthenticatedUserContext({
          userId: user.id,
          email: user.email,
          status: user.status ?? 'ACTIVE',
          roles: user.roles ?? [],
          permissions: user.permissions ?? [],
          tenantId: user.tenantId ?? null,
        })
      : null;

    const executeAction = async (): Promise<PaymentResponseDto> => {
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
              userId: user.id,
              email: user.email,
              roles: user.roles,
              permissions: user.permissions,
            }
          : undefined,
      });

      const result = await this._recordPaymentHandler.execute(command);
      return this.handleResult(result) as unknown as PaymentResponseDto;
    };

    return userContext ? RequestContext.run(userContext, executeAction) : executeAction();
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

  @Post(['payments/:id/complete', ':saleId/payments/:id/complete'])
  @HttpCode(HttpStatus.OK)
  @Roles('Owner', 'Manager', 'Receptionist')
  @Permissions('payments.create', 'payments.manage')
  @ApiOperation({
    summary: 'Confirm completion/settlement of an unsettled pending payment transaction',
    description:
      'Transitions a PENDING payment to COMPLETED, sets the definitive paidAt timestamp, and advances the parent Sale status if balance is satisfied. Target payment must currently be in PENDING status. Calling this on a terminal state (COMPLETED, FAILED, CANCELLED) will be rejected with HTTP 422 Unprocessable Entity.',
  })
  @ApiParam({ name: 'id', description: 'Pending Payment UUID identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: PaymentResponseDto,
    description:
      'Payment completed successfully. Returns updated payment aggregate representation with COMPLETED status and populated paidAt timestamp.',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed or malformed reference trace string.',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid authentication token.',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description:
      'Forbidden: Caller lacks required payments.create/manage permissions or cross-tenant access.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment with the specified identifier was not found.',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description:
      'Optimistic concurrency control conflict: payment was concurrently modified by another process.',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Payment is not in PENDING state (already completed, failed, or cancelled).',
  })
  public async completePayment(
    @Param('id') id: string,
    @Body() dto: CompletePaymentRequestDto = {},
    @CurrentUser() user?: AuthenticatedUserPayload,
    @Param('saleId') paramSaleId?: string,
    @Query('saleId') querySaleId?: string,
  ): Promise<PaymentResponseDto> {
    const effectiveSaleId = paramSaleId ?? querySaleId;
    const userContext = user
      ? new AuthenticatedUserContext({
          userId: user.id,
          email: user.email,
          status: user.status ?? 'ACTIVE',
          roles: user.roles ?? [],
          permissions: user.permissions ?? [],
          tenantId: user.tenantId ?? null,
        })
      : null;

    const executeAction = async (): Promise<PaymentResponseDto> => {
      const command = new CompletePaymentCommand({
        paymentId: id,
        saleId: effectiveSaleId,
        reference: dto?.reference,
        tenantId: user?.tenantId ?? undefined,
        currentUser: user
          ? {
              id: user.id,
              userId: user.id,
              email: user.email,
              roles: user.roles,
              permissions: user.permissions,
            }
          : undefined,
      });

      const result = await this._completePaymentHandler.execute(command);
      return this.handleResult(result) as unknown as PaymentResponseDto;
    };

    return userContext ? RequestContext.run(userContext, executeAction) : executeAction();
  }

  @Post(['payments/:id/settle', ':saleId/payments/:id/settle'])
  @HttpCode(HttpStatus.OK)
  @Roles('Owner', 'Manager', 'Receptionist')
  @Permissions('payments.create', 'payments.manage')
  @ApiOperation({
    summary:
      'Confirm settlement of an unsettled pending payment transaction (canonical alias for complete)',
    description:
      'Transitions a PENDING payment to SETTLED/COMPLETED, sets the definitive paidAt timestamp, and advances parent Sale status. Target payment must currently be in PENDING status.',
  })
  @ApiParam({ name: 'id', description: 'Pending Payment UUID identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: PaymentResponseDto,
    description: 'Payment settled successfully.',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed or malformed reference trace string.',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid authentication token.',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description:
      'Forbidden: Caller lacks required payments.create/manage permissions or cross-tenant access.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment with the specified identifier was not found.',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description:
      'Optimistic concurrency control conflict: payment was concurrently modified by another process.',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Payment is not in PENDING state (already settled, failed, or cancelled).',
  })
  public async settlePayment(
    @Param('id') id: string,
    @Body() dto: SettlePaymentRequestDto = {},
    @CurrentUser() user?: AuthenticatedUserPayload,
    @Param('saleId') paramSaleId?: string,
    @Query('saleId') querySaleId?: string,
  ): Promise<PaymentResponseDto> {
    const effectiveSaleId = paramSaleId ?? querySaleId;
    const userContext = user
      ? new AuthenticatedUserContext({
          userId: user.id,
          email: user.email,
          status: user.status ?? 'ACTIVE',
          roles: user.roles ?? [],
          permissions: user.permissions ?? [],
          tenantId: user.tenantId ?? null,
        })
      : null;

    const executeAction = async (): Promise<PaymentResponseDto> => {
      const command = new SettlePaymentCommand({
        paymentId: id,
        saleId: effectiveSaleId,
        reference: dto?.reference,
        tenantId: user?.tenantId ?? undefined,
        currentUser: user
          ? {
              id: user.id,
              userId: user.id,
              email: user.email,
              roles: user.roles,
              permissions: user.permissions,
            }
          : undefined,
      });

      const result = await this._settlePaymentHandler.execute(command);
      return this.handleResult(result) as unknown as PaymentResponseDto;
    };

    return userContext ? RequestContext.run(userContext, executeAction) : executeAction();
  }

  @Post(['payments/:id/fail', ':saleId/payments/:id/fail'])
  @HttpCode(HttpStatus.OK)
  @Roles('Owner', 'Manager', 'Receptionist')
  @Permissions('payments.create', 'payments.manage')
  @ApiOperation({
    summary: 'Mark an unsettled pending payment transaction as failed',
    description:
      'Transitions a PENDING payment to FAILED upon provider decline or rail timeout. Target payment must currently be in PENDING status. Terminal states (COMPLETED, FAILED, CANCELLED) cannot be transitioned to failed and return HTTP 422 Unprocessable Entity.',
  })
  @ApiParam({ name: 'id', description: 'Pending Payment UUID identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: PaymentResponseDto,
    description:
      'Payment marked as failed successfully. Returns updated payment aggregate representation with FAILED status and null paidAt.',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed or malformed request payload.',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid authentication token.',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description:
      'Forbidden: Caller lacks required payments.create/manage permissions or cross-tenant access.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment with the specified identifier was not found.',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description:
      'Optimistic concurrency control conflict: payment was concurrently modified by another process.',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Payment is not in PENDING state (already completed, failed, or cancelled).',
  })
  public async failPayment(
    @Param('id') id: string,
    @Body() dto: FailPaymentRequestDto = {},
    @CurrentUser() user?: AuthenticatedUserPayload,
    @Param('saleId') paramSaleId?: string,
    @Query('saleId') querySaleId?: string,
  ): Promise<PaymentResponseDto> {
    const effectiveSaleId = paramSaleId ?? querySaleId;
    const userContext = user
      ? new AuthenticatedUserContext({
          userId: user.id,
          email: user.email,
          status: user.status ?? 'ACTIVE',
          roles: user.roles ?? [],
          permissions: user.permissions ?? [],
          tenantId: user.tenantId ?? null,
        })
      : null;

    const executeAction = async (): Promise<PaymentResponseDto> => {
      const command = new FailPaymentCommand({
        paymentId: id,
        saleId: effectiveSaleId,
        reason: dto?.reason,
        tenantId: user?.tenantId ?? undefined,
        currentUser: user
          ? {
              id: user.id,
              userId: user.id,
              email: user.email,
              roles: user.roles,
              permissions: user.permissions,
            }
          : undefined,
      });

      const result = await this._failPaymentHandler.execute(command);
      return this.handleResult(result) as unknown as PaymentResponseDto;
    };

    return userContext ? RequestContext.run(userContext, executeAction) : executeAction();
  }

  @Post(['payments/:id/cancel', ':saleId/payments/:id/cancel'])
  @HttpCode(HttpStatus.OK)
  @Roles('Owner', 'Manager')
  @Permissions('payments.manage')
  @ApiOperation({
    summary: 'Void or cancel an unsettled pending payment transaction',
    description:
      'Transitions a PENDING payment to CANCELLED. Requires elevated payments.manage permission. Target payment must currently be in PENDING status. Settled or terminal payments can never be cancelled in-place and return HTTP 422 Unprocessable Entity.',
  })
  @ApiParam({ name: 'id', description: 'Pending Payment UUID identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: PaymentResponseDto,
    description:
      'Payment cancelled successfully. Returns updated payment aggregate representation with CANCELLED status and null paidAt.',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed or malformed cancellation reason payload.',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid authentication token.',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description:
      'Forbidden: Caller lacks required payments.manage permission or cross-tenant access.',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment with the specified identifier was not found.',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description:
      'Optimistic concurrency control conflict: payment was concurrently modified by another process.',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Payment is already settled or in a terminal state and cannot be cancelled.',
  })
  public async cancelPayment(
    @Param('id') id: string,
    @Body() dto: CancelPaymentRequestDto = {},
    @CurrentUser() user?: AuthenticatedUserPayload,
    @Param('saleId') paramSaleId?: string,
    @Query('saleId') querySaleId?: string,
  ): Promise<PaymentResponseDto> {
    const effectiveSaleId = paramSaleId ?? querySaleId;
    const userContext = user
      ? new AuthenticatedUserContext({
          userId: user.id,
          email: user.email,
          status: user.status ?? 'ACTIVE',
          roles: user.roles ?? [],
          permissions: user.permissions ?? [],
          tenantId: user.tenantId ?? null,
        })
      : null;

    const executeAction = async (): Promise<PaymentResponseDto> => {
      const command = new CancelPaymentCommand({
        paymentId: id,
        saleId: effectiveSaleId,
        reason: dto?.reason,
        tenantId: user?.tenantId ?? undefined,
        currentUser: user
          ? {
              id: user.id,
              userId: user.id,
              email: user.email,
              roles: user.roles,
              permissions: user.permissions,
            }
          : undefined,
      });

      const result = await this._cancelPaymentHandler.execute(command);
      return this.handleResult(result) as unknown as PaymentResponseDto;
    };

    return userContext ? RequestContext.run(userContext, executeAction) : executeAction();
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
