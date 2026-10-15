import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Optional,
  Param,
  Post,
  Query,
  UnprocessableEntityException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import {
  PaymentRepositoryPort,
  SaleRepositoryPort,
  PaymentStatus,
  RecordPaymentHandler,
  CreatePaymentHandler,
  GetPaymentByIdHandler,
  GetPaymentHandler,
  GetPaymentsBySaleIdHandler,
  GetSalePaymentHistoryHandler,
  CompletePaymentHandler,
  SettlePaymentHandler,
  FailPaymentHandler,
  CancelPaymentHandler,
  ListPaymentsHandler,
  CreatePaymentCommand,
  GetPaymentQuery,
  GetSalePaymentHistoryQuery,
  CompletePaymentCommand,
  SettlePaymentCommand,
  FailPaymentCommand,
  CancelPaymentCommand,
  ListPaymentsQuery,
  SalesApplicationResult,
  IUnitOfWork,
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
  PaymentSummaryResponseDto,
  PaymentDetailResponseDto,
  CompletePaymentRequestDto,
  SettlePaymentRequestDto,
  FailPaymentRequestDto,
  CancelPaymentRequestDto,
  ListPaymentsQueryDto,
  PaginatedPaymentsResponseDto,
} from '../dto';
import { SalesExceptionFilter } from '../filters/sales-exception.filter';
import {
  PAYMENT_REPOSITORY_TOKEN,
  SALE_REPOSITORY_TOKEN,
  UNIT_OF_WORK_TOKEN,
} from '../sales.tokens';

export { PAYMENT_REPOSITORY_TOKEN, UNIT_OF_WORK_TOKEN };

@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@UseFilters(SalesExceptionFilter)
@Controller('api/v1')
export class PaymentsController {
  private readonly _createPaymentHandler: CreatePaymentHandler;
  private readonly _getPaymentByIdHandler: GetPaymentByIdHandler;
  private readonly _getSalePaymentHistoryHandler: GetSalePaymentHistoryHandler;
  private readonly _completePaymentHandler: CompletePaymentHandler;
  private readonly _settlePaymentHandler: SettlePaymentHandler;
  private readonly _failPaymentHandler: FailPaymentHandler;
  private readonly _cancelPaymentHandler: CancelPaymentHandler;
  private readonly _listPaymentsHandler: ListPaymentsHandler;

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
    @Inject(GetSalePaymentHistoryHandler)
    getSalePaymentHistoryHandler?: GetSalePaymentHistoryHandler,
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
    @Optional()
    @Inject(ListPaymentsHandler)
    listPaymentsHandler?: ListPaymentsHandler,
    @Optional()
    @Inject(CreatePaymentHandler)
    createPaymentHandler?: CreatePaymentHandler,
    @Optional()
    @Inject(GetPaymentHandler)
    getPaymentHandler?: GetPaymentHandler,
    @Optional()
    @Inject(UNIT_OF_WORK_TOKEN)
    unitOfWork?: IUnitOfWork,
  ) {
    this._createPaymentHandler =
      createPaymentHandler ??
      recordPaymentHandler ??
      new CreatePaymentHandler(paymentRepository, saleRepository, undefined, undefined, unitOfWork);
    this._getPaymentByIdHandler =
      getPaymentByIdHandler ??
      getPaymentHandler ??
      new GetPaymentByIdHandler(paymentRepository, saleRepository);
    this._getSalePaymentHistoryHandler =
      getSalePaymentHistoryHandler ??
      (getPaymentsBySaleIdHandler &&
      !(getPaymentsBySaleIdHandler instanceof GetPaymentsBySaleIdHandler)
        ? (getPaymentsBySaleIdHandler as unknown as GetSalePaymentHistoryHandler)
        : undefined) ??
      new GetSalePaymentHistoryHandler(paymentRepository, saleRepository);
    this._completePaymentHandler =
      completePaymentHandler ??
      settlePaymentHandler ??
      new CompletePaymentHandler(
        paymentRepository,
        saleRepository,
        undefined,
        undefined,
        unitOfWork,
      );
    this._settlePaymentHandler =
      settlePaymentHandler ??
      (this._completePaymentHandler as SettlePaymentHandler) ??
      new SettlePaymentHandler(paymentRepository, saleRepository, undefined, undefined, unitOfWork);
    this._failPaymentHandler =
      failPaymentHandler ?? new FailPaymentHandler(paymentRepository, saleRepository);
    this._cancelPaymentHandler =
      cancelPaymentHandler ?? new CancelPaymentHandler(paymentRepository, saleRepository);
    this._listPaymentsHandler = listPaymentsHandler ?? new ListPaymentsHandler(paymentRepository);
  }

  @Post(['sales/:saleId/payments', 'payments'])
  @HttpCode(HttpStatus.CREATED)
  @Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')
  @Permissions('payments.create')
  @ApiOperation({
    summary: 'Record payment tender against a finalized commercial sale order',
    description:
      'Records cash or electronic payment against a sale in PENDING_PAYMENT or PARTIALLY_PAID status. Automatically coordinates Sale status transitions to PARTIALLY_PAID or PAID upon settlement.',
  })
  @ApiParam({ name: 'saleId', required: false, description: 'Sale UUID identifier' })
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
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid authentication token.',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description:
      'Caller lacks required payments.create permission or cross-tenant access attempted',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Target sale does not exist',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description:
      'Optimistic concurrency control conflict or duplicate payment reference for target sale',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Sale is not in a payable status, or payment amount exceeds remaining balance',
  })
  public async recordPayment(
    @Param('saleId') saleIdParam?: string,
    @Body() dto: RecordPaymentRequestDto = {} as RecordPaymentRequestDto,
    @CurrentUser() user?: AuthenticatedUserPayload,
  ): Promise<PaymentResponseDto> {
    const rawSaleId = saleIdParam ?? dto?.saleId;
    if (!rawSaleId || typeof rawSaleId !== 'string' || !rawSaleId.trim()) {
      throw new BadRequestException('Sale ID cannot be empty or whitespace.');
    }
    const saleId = rawSaleId.trim();
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
      const command = new CreatePaymentCommand({
        saleId,
        amount: dto.amount,
        currency: dto.currency,
        method: dto.method,
        status:
          dto.status === PaymentStatus.PENDING
            ? PaymentStatus.PENDING
            : dto.status === PaymentStatus.COMPLETED
              ? PaymentStatus.COMPLETED
              : undefined,
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

      const result = await this._createPaymentHandler.execute(command);
      return this.handleResult(result) as unknown as PaymentResponseDto;
    };

    return userContext ? RequestContext.run(userContext, executeAction) : executeAction();
  }

  @Get(['sales/:saleId/payments', 'sales/:saleId/payments/history'])
  @HttpCode(HttpStatus.OK)
  @Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')
  @Permissions('payments.read')
  @ApiOperation({
    summary: 'List all payment transactions associated with a commercial sale',
    description:
      'Retrieves the chronological payment history for a given sale, allowing inspection of split tenders, partial payments, and settlements.',
  })
  @ApiParam({ name: 'saleId', description: 'Sale UUID identifier' })
  @ApiQuery({
    name: 'sortDirection',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Chronological ordering direction (default: asc)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: [PaymentSummaryResponseDto],
    description: 'List of payment records for the requested sale',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Sale ID cannot be empty or whitespace',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Target sale does not exist within the caller tenant scope',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid authentication token.',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Caller lacks required payments.read permission or cross-tenant access attempted',
  })
  public async getPaymentsBySaleId(
    @Param('saleId') saleId: string,
    @CurrentUser() userOrSort?: AuthenticatedUserPayload | 'asc' | 'desc',
    @Query('sortDirection') querySort?: 'asc' | 'desc' | AuthenticatedUserPayload,
  ): Promise<PaymentResponseDto[]> {
    let user: AuthenticatedUserPayload | undefined;
    let sortDirection: 'asc' | 'desc' | undefined;

    if (userOrSort && typeof userOrSort === 'object') {
      user = userOrSort as AuthenticatedUserPayload;
      if (typeof querySort === 'string') {
        sortDirection = querySort.toLowerCase() as 'asc' | 'desc';
      }
    } else if (typeof userOrSort === 'string') {
      sortDirection = userOrSort.toLowerCase() as 'asc' | 'desc';
      if (querySort && typeof querySort === 'object') {
        user = querySort as AuthenticatedUserPayload;
      }
    } else if (querySort && typeof querySort === 'object') {
      user = querySort as AuthenticatedUserPayload;
    } else if (typeof querySort === 'string') {
      sortDirection = querySort.toLowerCase() as 'asc' | 'desc';
    }

    if (!saleId || typeof saleId !== 'string' || !saleId.trim()) {
      throw new BadRequestException('Sale ID cannot be empty or whitespace.');
    }
    const cleanSaleId = saleId.trim();

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

    const executeAction = async (): Promise<PaymentResponseDto[]> => {
      const query = new GetSalePaymentHistoryQuery({
        saleId: cleanSaleId,
        sortDirection,
        order: sortDirection,
        tenantId: user?.tenantId ?? undefined,
        currentUser: user
          ? {
              id: user.id,
              userId: user.id,
              tenantId: user.tenantId ?? undefined,
              roles: user.roles,
              permissions: user.permissions,
            }
          : undefined,
      });

      const result = await this._getSalePaymentHistoryHandler.execute(query);
      const payments = this.handleResult(result);
      return payments.map((p) => ({
        id: p.id,
        saleId: p.saleId,
        method: p.method,
        amount: p.amount,
        amountValue: p.amountValue,
        status: p.status,
        reference: p.reference ?? null,
        paidAt: p.paidAt ?? null,
        createdAt: p.createdAt,
        version: p.version,
      }));
    };

    return userContext ? RequestContext.run(userContext, executeAction) : executeAction();
  }

  @Get(['payments/:id', 'payments/:paymentId'])
  @HttpCode(HttpStatus.OK)
  @Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')
  @Permissions('payments.read')
  @ApiOperation({
    summary: 'Retrieve individual payment transaction by identifier',
    description:
      'Fetches a single payment record with full audit metadata, method, status, and structured monetary representation.',
  })
  @ApiParam({ name: 'id', description: 'Payment UUID identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: PaymentDetailResponseDto,
    description: 'Payment record resolved successfully',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Payment ID cannot be empty or whitespace',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Payment with specified ID does not exist within the caller tenant scope',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid authentication token.',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Caller lacks required payments.read permission or cross-tenant access attempted',
  })
  public async getPaymentById(
    @Param('id') idParam?: string,
    @CurrentUser() userParam?: AuthenticatedUserPayload,
    @Param('paymentId') paymentIdParam?: string,
  ): Promise<PaymentDetailResponseDto> {
    const rawId =
      (idParam && typeof idParam === 'string' && idParam.trim() ? idParam : undefined) ??
      (paymentIdParam && typeof paymentIdParam === 'string' && paymentIdParam.trim()
        ? paymentIdParam
        : undefined) ??
      (typeof userParam === 'string' ? userParam : undefined);

    let user: AuthenticatedUserPayload | undefined;
    if (userParam && typeof userParam === 'object') {
      user = userParam;
    }

    if (!rawId || !rawId.trim()) {
      throw new BadRequestException('Payment ID cannot be empty or whitespace.');
    }
    const paymentId = rawId.trim();

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

    const executeAction = async (): Promise<PaymentDetailResponseDto> => {
      const query = new GetPaymentQuery({
        paymentId,
        tenantId: user?.tenantId ?? undefined,
        currentUser: user
          ? {
              id: user.id,
              userId: user.id,
              email: user.email,
              tenantId: user.tenantId ?? undefined,
              roles: user.roles,
              permissions: user.permissions,
            }
          : undefined,
      });

      const result = await this._getPaymentByIdHandler.execute(query);
      const payment = this.handleResult(result);
      return {
        id: payment.id,
        saleId: payment.saleId,
        method: payment.method,
        amount: payment.amount,
        amountValue: payment.amountValue,
        status: payment.status,
        reference: payment.reference ?? null,
        paidAt: payment.paidAt ?? null,
        createdAt: payment.createdAt,
        version: payment.version,
      };
    };

    return userContext ? RequestContext.run(userContext, executeAction) : executeAction();
  }

  @Get('payments')
  @HttpCode(HttpStatus.OK)
  @Roles('Owner', 'Manager', 'Receptionist')
  @Permissions('payments.read')
  @ApiOperation({
    summary: 'List payment transactions with pagination, filtering, and sorting',
    description:
      'Retrieves paginated payment records matching filter criteria across the caller tenant scope.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: PaginatedPaymentsResponseDto,
    description: 'Paginated list of payment records',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid query parameters, invalid date ranges, or un-allowlisted sort fields',
  })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'Missing or invalid authentication token.',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Caller lacks required payments.read permission',
  })
  public async listPayments(
    @Query() queryDto: ListPaymentsQueryDto = {},
    @CurrentUser() user?: AuthenticatedUserPayload,
  ): Promise<unknown> {
    const query = new ListPaymentsQuery({
      ...queryDto,
      tenantId: user?.tenantId ?? undefined,
      currentUser: user
        ? {
            id: user.id,
            userId: user.id,
            email: user.email,
            tenantId: user.tenantId ?? undefined,
            roles: user.roles,
            permissions: user.permissions,
          }
        : undefined,
    });

    const result = await this._listPaymentsHandler.execute(query);
    return this.handleResult(result);
  }

  @Post(['payments', 'sales/:saleId/payments/create'])
  @HttpCode(HttpStatus.CREATED)
  @Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')
  @Permissions('payments.create')
  @ApiOperation({
    summary:
      'Create payment tender against a finalized commercial sale order (alias for recordPayment)',
    description:
      'Creates a payment tender against a sale order in accordance with CQRS conventions.',
  })
  public async createPayment(
    @Param('saleId') saleId: string,
    @Body() dto: RecordPaymentRequestDto,
    @CurrentUser() user?: AuthenticatedUserPayload,
  ): Promise<PaymentResponseDto> {
    return this.recordPayment(saleId, dto, user);
  }

  @Get('payments/:paymentId/detail')
  @HttpCode(HttpStatus.OK)
  @Roles('Owner', 'Manager', 'Receptionist')
  @Permissions('payments.read')
  @ApiOperation({
    summary: 'Retrieve individual payment transaction by identifier (alias for getPaymentById)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: PaymentDetailResponseDto,
    description: 'Detailed payment record resolved successfully',
  })
  public async getPayment(
    @Param('paymentId') paymentId: string,
    @CurrentUser() user?: AuthenticatedUserPayload,
  ): Promise<PaymentDetailResponseDto> {
    return this.getPaymentById(paymentId, user);
  }

  @Get('sales/:saleId/payments/history')
  @HttpCode(HttpStatus.OK)
  @Roles('Owner', 'Manager', 'Receptionist')
  @Permissions('payments.read')
  @ApiOperation({
    summary:
      'List all payment transactions associated with a commercial sale using canonical history query',
  })
  public async getSalePaymentHistory(
    @Param('saleId') saleId: string,
    @CurrentUser() user?: AuthenticatedUserPayload,
  ): Promise<PaymentResponseDto[]> {
    if (!saleId || typeof saleId !== 'string' || !saleId.trim()) {
      throw new BadRequestException('Sale ID cannot be empty or whitespace.');
    }
    const query = new GetSalePaymentHistoryQuery({
      saleId: saleId.trim(),
      tenantId: user?.tenantId ?? undefined,
      currentUser: user
        ? {
            id: user.id,
            tenantId: user.tenantId ?? undefined,
            roles: user.roles,
            permissions: user.permissions,
          }
        : undefined,
    });

    const result = await this._getSalePaymentHistoryHandler.execute(query);
    return this.handleResult(result) as unknown as PaymentResponseDto[];
  }

  @Post([
    'payments/:id/complete',
    ':saleId/payments/:id/complete',
    'sales/:saleId/payments/:id/complete',
  ])
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
    if (!id || typeof id !== 'string' || !id.trim()) {
      throw new BadRequestException('Payment ID cannot be empty or whitespace.');
    }
    const rawSaleId = paramSaleId ?? querySaleId;
    const effectiveSaleId =
      rawSaleId && typeof rawSaleId === 'string' && rawSaleId.trim() ? rawSaleId.trim() : undefined;

    let effectiveDto = dto ?? {};
    let effectiveUser = user;
    if (
      dto &&
      typeof dto === 'object' &&
      ('userId' in dto || 'roles' in dto || 'permissions' in dto) &&
      !user
    ) {
      effectiveUser = dto as unknown as AuthenticatedUserPayload;
      effectiveDto = {};
    }

    const userContext = effectiveUser
      ? new AuthenticatedUserContext({
          userId: effectiveUser.id,
          email: effectiveUser.email,
          status: effectiveUser.status ?? 'ACTIVE',
          roles: effectiveUser.roles ?? [],
          permissions: effectiveUser.permissions ?? [],
          tenantId: effectiveUser.tenantId ?? null,
        })
      : null;

    const executeAction = async (): Promise<PaymentResponseDto> => {
      const command = new CompletePaymentCommand({
        paymentId: id.trim(),
        saleId: effectiveSaleId,
        reference: effectiveDto?.reference,
        tenantId: effectiveUser?.tenantId ?? undefined,
        currentUser: effectiveUser
          ? {
              id: effectiveUser.id,
              userId: effectiveUser.id,
              email: effectiveUser.email,
              roles: effectiveUser.roles,
              permissions: effectiveUser.permissions,
            }
          : undefined,
      });

      const result = await this._completePaymentHandler.execute(command);
      return this.handleResult(result) as unknown as PaymentResponseDto;
    };

    return userContext ? RequestContext.run(userContext, executeAction) : executeAction();
  }

  @Post(['payments/:id/settle', ':saleId/payments/:id/settle', 'sales/:saleId/payments/:id/settle'])
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
    if (!id || typeof id !== 'string' || !id.trim()) {
      throw new BadRequestException('Payment ID cannot be empty or whitespace.');
    }
    const rawSaleId = paramSaleId ?? querySaleId;
    const effectiveSaleId =
      rawSaleId && typeof rawSaleId === 'string' && rawSaleId.trim() ? rawSaleId.trim() : undefined;

    let effectiveDto = dto ?? {};
    let effectiveUser = user;
    if (
      dto &&
      typeof dto === 'object' &&
      ('userId' in dto || 'roles' in dto || 'permissions' in dto) &&
      !user
    ) {
      effectiveUser = dto as unknown as AuthenticatedUserPayload;
      effectiveDto = {};
    }

    const userContext = effectiveUser
      ? new AuthenticatedUserContext({
          userId: effectiveUser.id,
          email: effectiveUser.email,
          status: effectiveUser.status ?? 'ACTIVE',
          roles: effectiveUser.roles ?? [],
          permissions: effectiveUser.permissions ?? [],
          tenantId: effectiveUser.tenantId ?? null,
        })
      : null;

    const executeAction = async (): Promise<PaymentResponseDto> => {
      const command = new SettlePaymentCommand({
        paymentId: id.trim(),
        saleId: effectiveSaleId,
        reference: effectiveDto?.reference,
        tenantId: effectiveUser?.tenantId ?? undefined,
        currentUser: effectiveUser
          ? {
              id: effectiveUser.id,
              userId: effectiveUser.id,
              email: effectiveUser.email,
              roles: effectiveUser.roles,
              permissions: effectiveUser.permissions,
            }
          : undefined,
      });

      const result = await this._settlePaymentHandler.execute(command);
      return this.handleResult(result) as unknown as PaymentResponseDto;
    };

    return userContext ? RequestContext.run(userContext, executeAction) : executeAction();
  }

  @Post(['payments/:id/fail', ':saleId/payments/:id/fail', 'sales/:saleId/payments/:id/fail'])
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
    if (!id || typeof id !== 'string' || !id.trim()) {
      throw new BadRequestException('Payment ID cannot be empty or whitespace.');
    }
    const rawSaleId = paramSaleId ?? querySaleId;
    const effectiveSaleId =
      rawSaleId && typeof rawSaleId === 'string' && rawSaleId.trim() ? rawSaleId.trim() : undefined;

    let effectiveDto = dto ?? {};
    let effectiveUser = user;
    if (
      dto &&
      typeof dto === 'object' &&
      ('userId' in dto || 'roles' in dto || 'permissions' in dto) &&
      !user
    ) {
      effectiveUser = dto as unknown as AuthenticatedUserPayload;
      effectiveDto = {};
    }

    const userContext = effectiveUser
      ? new AuthenticatedUserContext({
          userId: effectiveUser.id,
          email: effectiveUser.email,
          status: effectiveUser.status ?? 'ACTIVE',
          roles: effectiveUser.roles ?? [],
          permissions: effectiveUser.permissions ?? [],
          tenantId: effectiveUser.tenantId ?? null,
        })
      : null;

    const executeAction = async (): Promise<PaymentResponseDto> => {
      const command = new FailPaymentCommand({
        paymentId: id.trim(),
        saleId: effectiveSaleId,
        reason:
          typeof effectiveDto?.reason === 'string' && effectiveDto.reason.trim()
            ? effectiveDto.reason.trim()
            : undefined,
        tenantId: effectiveUser?.tenantId ?? undefined,
        currentUser: effectiveUser
          ? {
              id: effectiveUser.id,
              userId: effectiveUser.id,
              email: effectiveUser.email,
              roles: effectiveUser.roles,
              permissions: effectiveUser.permissions,
            }
          : undefined,
      });

      const result = await this._failPaymentHandler.execute(command);
      return this.handleResult(result) as unknown as PaymentResponseDto;
    };

    return userContext ? RequestContext.run(userContext, executeAction) : executeAction();
  }

  @Post(['payments/:id/cancel', ':saleId/payments/:id/cancel', 'sales/:saleId/payments/:id/cancel'])
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
    if (!id || typeof id !== 'string' || !id.trim()) {
      throw new BadRequestException('Payment ID cannot be empty or whitespace.');
    }
    const rawSaleId = paramSaleId ?? querySaleId;
    const effectiveSaleId =
      rawSaleId && typeof rawSaleId === 'string' && rawSaleId.trim() ? rawSaleId.trim() : undefined;

    let effectiveDto = dto ?? {};
    let effectiveUser = user;
    if (
      dto &&
      typeof dto === 'object' &&
      ('userId' in dto || 'roles' in dto || 'permissions' in dto) &&
      !user
    ) {
      effectiveUser = dto as unknown as AuthenticatedUserPayload;
      effectiveDto = {};
    }

    const userContext = effectiveUser
      ? new AuthenticatedUserContext({
          userId: effectiveUser.id,
          email: effectiveUser.email,
          status: effectiveUser.status ?? 'ACTIVE',
          roles: effectiveUser.roles ?? [],
          permissions: effectiveUser.permissions ?? [],
          tenantId: effectiveUser.tenantId ?? null,
        })
      : null;

    const executeAction = async (): Promise<PaymentResponseDto> => {
      const command = new CancelPaymentCommand({
        paymentId: id.trim(),
        saleId: effectiveSaleId,
        reason:
          typeof effectiveDto?.reason === 'string' && effectiveDto.reason.trim()
            ? effectiveDto.reason.trim()
            : undefined,
        tenantId: effectiveUser?.tenantId ?? undefined,
        currentUser: effectiveUser
          ? {
              id: effectiveUser.id,
              userId: effectiveUser.id,
              email: effectiveUser.email,
              roles: effectiveUser.roles,
              permissions: effectiveUser.permissions,
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
      const lower = message.toLowerCase();
      if (
        lower.includes('unauthorized') ||
        lower.includes('forbidden') ||
        lower.includes('permission')
      ) {
        throw new ForbiddenException(message);
      }
      if (
        lower.includes('not found') ||
        lower.includes('was not found') ||
        lower.includes('does not exist')
      ) {
        throw new NotFoundException(message);
      }
      if (
        lower.includes('conflict') ||
        lower.includes('optimistic') ||
        lower.includes('already exists') ||
        lower.includes('duplicate')
      ) {
        throw new ConflictException(message);
      }
      if (
        lower.includes('unprocessable') ||
        lower.includes('transition') ||
        lower.includes('cannot transition') ||
        lower.includes('terminal')
      ) {
        throw new UnprocessableEntityException(message);
      }
      throw new BadRequestException(message);
    }
    return result.getValue();
  }
}
