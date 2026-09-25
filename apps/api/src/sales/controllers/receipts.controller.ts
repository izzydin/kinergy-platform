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
  ReceiptRepositoryPort,
  SaleRepositoryPort,
  PaymentRepositoryPort,
  IssueReceiptHandler,
  GetReceiptHandler,
  GetReceiptBySaleHandler,
  IssueReceiptCommand,
  GetReceiptQuery,
  GetReceiptByIdQuery,
  GetReceiptBySaleQuery,
  SalesApplicationResult,
} from '@kinergy-platform/core';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { Permissions, Roles, CurrentUser } from '../../platform/identity/decorators';
import { AuthenticatedUserPayload } from '../../platform/identity/decorators/current-user.decorator';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import { RequestContext } from '../../platform/identity/request-context';
import { IssueReceiptRequestDto, IssueReceiptDirectRequestDto, ReceiptResponseDto } from '../dto';
import { SalesExceptionFilter } from '../filters/sales-exception.filter';
import { SALE_REPOSITORY_TOKEN } from './sales.controller';
import { PAYMENT_REPOSITORY_TOKEN } from './payments.controller';

export const RECEIPT_REPOSITORY_TOKEN = 'ReceiptRepositoryPort';

@ApiTags('Receipts')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@UseFilters(SalesExceptionFilter)
@Controller('api/v1')
export class ReceiptsController {
  private readonly _issueReceiptHandler: IssueReceiptHandler;
  private readonly _getReceiptHandler: GetReceiptHandler;
  private readonly _getReceiptBySaleHandler: GetReceiptBySaleHandler;

  constructor(
    @Inject(RECEIPT_REPOSITORY_TOKEN)
    receiptRepository: ReceiptRepositoryPort,
    @Inject(SALE_REPOSITORY_TOKEN)
    saleRepository: SaleRepositoryPort,
    @Inject(PAYMENT_REPOSITORY_TOKEN)
    paymentRepository: PaymentRepositoryPort,
    @Optional()
    @Inject(IssueReceiptHandler)
    issueReceiptHandler?: IssueReceiptHandler,
    @Optional()
    @Inject(GetReceiptHandler)
    getReceiptHandler?: GetReceiptHandler,
    @Optional()
    @Inject(GetReceiptBySaleHandler)
    getReceiptBySaleHandler?: GetReceiptBySaleHandler,
  ) {
    this._issueReceiptHandler =
      issueReceiptHandler ??
      new IssueReceiptHandler(receiptRepository, saleRepository, paymentRepository);
    this._getReceiptHandler = getReceiptHandler ?? new GetReceiptHandler(receiptRepository);
    this._getReceiptBySaleHandler =
      getReceiptBySaleHandler ?? new GetReceiptBySaleHandler(receiptRepository, saleRepository);
  }

  @Post('sales/:saleId/receipt')
  @HttpCode(HttpStatus.CREATED)
  @Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')
  @Permissions('receipts.manage')
  @ApiOperation({
    summary: 'Issue an immutable customer receipt voucher for an already-settled sale',
    description:
      'Derives the legal proof-of-purchase receipt directly from authoritative Sale and Payment state. Strictly idempotent: repeated issuance returns the existing voucher. Guaranteed zero client tampering of financial totals or tender status.',
  })
  @ApiParam({ name: 'saleId', description: 'Target Sale UUID identifier' })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: ReceiptResponseDto,
    description: 'Receipt voucher issued or retrieved idempotently',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Validation failed or malformed request payload',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Target sale does not exist',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Sale is not PAID or COMPLETED, or payment tenders are insufficient',
  })
  public async issueReceipt(
    @Param('saleId') saleId: string,
    @Body() dto?: IssueReceiptRequestDto,
    @CurrentUser() user?: AuthenticatedUserPayload,
  ): Promise<ReceiptResponseDto> {
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

    const executeAction = async (): Promise<ReceiptResponseDto> => {
      const command = new IssueReceiptCommand({
        saleId,
        receiptId: dto?.receiptId,
        saleReference: dto?.saleReference,
        tenantId: user?.tenantId ?? undefined,
        currentUser: this.mapCurrentUser(user),
      });

      const result = await this._issueReceiptHandler.execute(command);
      const receiptDto = this.handleResult(result);
      return ReceiptResponseDto.fromDTO(receiptDto);
    };

    return userContext ? RequestContext.run(userContext, executeAction) : executeAction();
  }

  @Post('receipts')
  @HttpCode(HttpStatus.CREATED)
  @Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff')
  @Permissions('receipts.manage')
  @ApiOperation({
    summary: 'Issue receipt voucher specifying saleId in the request body',
    description:
      'Alternative endpoint for clients preferring POST /receipts with saleId in the request body.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: ReceiptResponseDto,
    description: 'Receipt voucher issued or retrieved idempotently',
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Missing saleId or validation failure',
  })
  public async issueReceiptDirect(
    @Body() dto: IssueReceiptDirectRequestDto,
    @CurrentUser() user?: AuthenticatedUserPayload,
  ): Promise<ReceiptResponseDto> {
    const saleId = dto?.saleId?.trim();
    if (!saleId) {
      throw new BadRequestException('saleId is required in request body.');
    }
    return this.issueReceipt(saleId, dto, user);
  }

  @Get('sales/:saleId/receipt')
  @HttpCode(HttpStatus.OK)
  @Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff', 'Trainer', 'Client')
  @Permissions('receipts.read')
  @ApiOperation({
    summary: 'Retrieve receipt voucher associated with a commercial sale',
    description: 'Resolves the primary immutable receipt document evidencing the requested sale.',
  })
  @ApiParam({ name: 'saleId', description: 'Target Sale UUID identifier' })
  @ApiResponse({
    status: HttpStatus.OK,
    type: ReceiptResponseDto,
    description: 'Receipt resolved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Sale does not exist or receipt has not been issued yet',
  })
  public async getReceiptBySale(
    @Param('saleId') saleId: string,
    @CurrentUser() user?: AuthenticatedUserPayload,
  ): Promise<ReceiptResponseDto> {
    const query = new GetReceiptBySaleQuery({
      saleId,
      tenantId: user?.tenantId ?? undefined,
      currentUser: this.mapCurrentUser(user),
    });

    const result = await this._getReceiptBySaleHandler.execute(query);
    const receiptDto = this.handleResult(result);
    return ReceiptResponseDto.fromDTO(receiptDto);
  }

  @Get('receipts/:receiptId')
  @HttpCode(HttpStatus.OK)
  @Roles('Owner', 'Manager', 'Receptionist', 'Kitchen Staff', 'Trainer', 'Client')
  @Permissions('receipts.read')
  @ApiOperation({
    summary: 'Retrieve receipt voucher by internal UUID or sequential receipt number',
    description:
      'Resolves a receipt by either its UUID (e.g. 123e4567...) or its human-readable alphanumeric sequence number (e.g. REC-2026-000421).',
  })
  @ApiParam({
    name: 'receiptId',
    description: 'Receipt UUID identifier or alphanumeric receipt number (REC-YYYY-XXXXXX)',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    type: ReceiptResponseDto,
    description: 'Receipt resolved successfully',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Receipt does not exist',
  })
  public async getReceiptById(
    @Param('receiptId') receiptId: string,
    @CurrentUser() user?: AuthenticatedUserPayload,
  ): Promise<ReceiptResponseDto> {
    const trimmed = receiptId?.trim();
    if (!trimmed) {
      throw new BadRequestException('Receipt identifier cannot be empty.');
    }

    const isReceiptNumber = trimmed.startsWith('REC-');
    const query = isReceiptNumber
      ? new GetReceiptQuery({
          receiptNumber: trimmed,
          tenantId: user?.tenantId ?? undefined,
          currentUser: this.mapCurrentUser(user),
        })
      : new GetReceiptByIdQuery({
          receiptId: trimmed,
          tenantId: user?.tenantId ?? undefined,
          currentUser: this.mapCurrentUser(user),
        });

    const result = await this._getReceiptHandler.execute(query);
    const receiptDto = this.handleResult(result);
    return ReceiptResponseDto.fromDTO(receiptDto);
  }

  private mapCurrentUser(user?: AuthenticatedUserPayload) {
    if (!user) return undefined;
    return {
      id: user.id,
      tenantId: user.tenantId ?? undefined,
      roles: user.roles,
      permissions: user.permissions,
    };
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
