import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { Permissions, Roles, CurrentUser } from '../../platform/identity/decorators';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import {
  CreateFixedAssetCommand,
  CreateFixedAssetHandler,
  UpdateFixedAssetDetailsCommand,
  UpdateFixedAssetDetailsHandler,
  TransferFixedAssetLocationCommand,
  TransferFixedAssetLocationHandler,
  ChangeFixedAssetStatusCommand,
  ChangeFixedAssetStatusHandler,
  UpdateFixedAssetConditionCommand,
  UpdateFixedAssetConditionHandler,
  RecordAssetMaintenanceCommand,
  RecordAssetMaintenanceHandler,
  UpdateFixedAssetValuationCommand,
  UpdateFixedAssetValuationHandler,
  GetFixedAssetByIdQuery,
  GetFixedAssetByIdHandler,
  GetFixedAssetByTagQuery,
  GetFixedAssetByTagHandler,
  ListFixedAssetsQuery,
  ListFixedAssetsHandler,
  GetAssetHistoryQuery,
  GetAssetHistoryHandler,
  GetMaintenanceHistoryQuery,
  GetMaintenanceHistoryHandler,
  GetAssetValueQuery,
  GetAssetValueHandler,
  GetFixedAssetValuationSummaryQuery,
  GetFixedAssetValuationSummaryHandler,
  AssetCategory,
  FixedAssetSortBy,
} from '@kinergy-platform/core';
import {
  CreateFixedAssetRequestDto,
  UpdateFixedAssetDetailsRequestDto,
  TransferFixedAssetLocationRequestDto,
  ChangeFixedAssetStatusRequestDto,
  UpdateFixedAssetConditionRequestDto,
  RecordAssetMaintenanceRequestDto,
  UpdateFixedAssetValuationRequestDto,
  ListFixedAssetsQueryDto,
  GetAssetHistoryQueryDto,
  GetMaintenanceHistoryQueryDto,
  AssetCategoryMetadataDto,
  PaginatedFixedAssetResponseDto,
  FixedAssetResponseDto,
  FixedAssetValuationResponseDto,
  FixedAssetValuationSummaryResponseDto,
} from '../dto';

const ASSET_CATEGORIES_METADATA: AssetCategoryMetadataDto[] = [
  {
    code: AssetCategory.GYM_EQUIPMENT,
    displayName: 'Gym Equipment',
    description:
      'Heavy machinery, cardio machines, free weights, and functional training stations.',
    requiresMaintenance: true,
    defaultInspectionIntervalDays: 90,
  },
  {
    code: AssetCategory.THERAPY_EQUIPMENT,
    displayName: 'Therapy Equipment',
    description: 'Clinical lasers, ultrasound machines, shockwave units, and treatment tables.',
    requiresMaintenance: true,
    defaultInspectionIntervalDays: 60,
  },
  {
    code: AssetCategory.KITCHEN_EQUIPMENT,
    displayName: 'Kitchen Equipment',
    description: 'Commercial blenders, refrigeration, shake station appliances, and ice machines.',
    requiresMaintenance: true,
    defaultInspectionIntervalDays: 180,
  },
  {
    code: AssetCategory.OFFICE_FURNITURE,
    displayName: 'Office Furniture',
    description: 'Desks, consultation chairs, reception counters, and filing cabinets.',
    requiresMaintenance: false,
  },
  {
    code: AssetCategory.ELECTRONICS,
    displayName: 'Electronics',
    description: 'POS terminals, sound systems, computers, tablets, and network infrastructure.',
    requiresMaintenance: true,
    defaultInspectionIntervalDays: 180,
  },
  {
    code: AssetCategory.CLEANING_EQUIPMENT,
    displayName: 'Cleaning Equipment',
    description: 'Industrial floor scrubbers, sanitization foggers, and wet-dry vacuums.',
    requiresMaintenance: true,
    defaultInspectionIntervalDays: 90,
  },
];

const getErrorMessage = (error: unknown): string => {
  if (!error) return 'Operation failed';
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
};

@ApiTags('Resources - Fixed Assets')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('api/v1/resources/assets')
export class FixedAssetsController {
  constructor(
    private readonly createFixedAssetHandler: CreateFixedAssetHandler,
    private readonly updateFixedAssetDetailsHandler: UpdateFixedAssetDetailsHandler,
    private readonly transferFixedAssetLocationHandler: TransferFixedAssetLocationHandler,
    private readonly changeFixedAssetStatusHandler: ChangeFixedAssetStatusHandler,
    private readonly updateFixedAssetConditionHandler: UpdateFixedAssetConditionHandler,
    private readonly recordAssetMaintenanceHandler: RecordAssetMaintenanceHandler,
    private readonly updateFixedAssetValuationHandler: UpdateFixedAssetValuationHandler,
    private readonly getFixedAssetByIdHandler: GetFixedAssetByIdHandler,
    private readonly getFixedAssetByTagHandler: GetFixedAssetByTagHandler,
    private readonly listFixedAssetsHandler: ListFixedAssetsHandler,
    private readonly getAssetHistoryHandler: GetAssetHistoryHandler,
    private readonly getMaintenanceHistoryHandler: GetMaintenanceHistoryHandler,
    private readonly getAssetValueHandler: GetAssetValueHandler,
    private readonly getFixedAssetValuationSummaryHandler: GetFixedAssetValuationSummaryHandler,
  ) {}

  @Get('categories')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER', 'TRAINER', 'RECEPTIONIST')
  @Permissions('assets.read')
  @ApiOperation({
    summary: 'List fixed asset category metadata',
    description:
      'Retrieves the static, code-defined asset taxonomy classification enum metadata for UI dropdowns and inspection schedules.',
  })
  @ApiResponse({
    status: 200,
    description: 'Asset category taxonomy metadata retrieved successfully.',
    type: [AssetCategoryMetadataDto],
  })
  public getCategories(): AssetCategoryMetadataDto[] {
    return ASSET_CATEGORIES_METADATA;
  }

  @Get('tag/:tag')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER', 'TRAINER', 'RECEPTIONIST')
  @Permissions('assets.read')
  @ApiOperation({
    summary: 'Lookup fixed asset by hardware barcode / RFID asset tag',
    description:
      'Hardware scanner integration endpoint resolving physical barcode or RFID tag to asset record.',
  })
  @ApiParam({ name: 'tag', description: 'Barcode or RFID Asset Tag', example: 'AST-GYM-001' })
  @ApiResponse({
    status: 200,
    description: 'Asset details retrieved successfully.',
    type: FixedAssetResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Asset not found with the specified tag.' })
  public async getAssetByTag(
    @Param('tag') tag: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<FixedAssetResponseDto> {
    const query = new GetFixedAssetByTagQuery({
      assetTag: tag,
      tenantId: user?.tenantId ?? undefined,
    });
    const result = await this.getFixedAssetByTagHandler.execute(query);
    if (!result.isSuccess) {
      throw new NotFoundException(result.error);
    }
    return result.value as unknown as FixedAssetResponseDto;
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER', 'TRAINER', 'RECEPTIONIST')
  @Permissions('assets.read')
  @ApiOperation({
    summary: 'List registered fixed assets',
    description:
      'Retrieves fixed asset inventory with category, status, condition, and location filtering.',
  })
  @ApiResponse({
    status: 200,
    description: 'Assets retrieved successfully.',
    type: PaginatedFixedAssetResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Insufficient privileges.' })
  public async listAssets(
    @Query() queryDto: ListFixedAssetsQueryDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<PaginatedFixedAssetResponseDto> {
    const query = new ListFixedAssetsQuery({
      tenantId: user?.tenantId ?? 'default_tenant',
      filter: {
        search: queryDto.search,
        category: queryDto.category,
        status: queryDto.status,
        condition: queryDto.condition,
        facilityId: queryDto.facilityId,
        roomId: queryDto.roomId,
        includeDecommissioned: queryDto.includeDecommissioned,
        page: queryDto.page,
        pageSize: queryDto.limit,
        sortBy: queryDto.sortBy as FixedAssetSortBy | undefined,
        sortOrder: queryDto.sortOrder,
      },
    });

    const result = await this.listFixedAssetsHandler.execute(query);
    if (!result.isSuccess) {
      throw new BadRequestException(result.error);
    }
    return result.value as unknown as PaginatedFixedAssetResponseDto;
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER', 'TRAINER', 'RECEPTIONIST')
  @Permissions('assets.read')
  @ApiOperation({ summary: 'Get fixed asset details by ID' })
  @ApiParam({ name: 'id', description: 'Unique Fixed Asset ID' })
  @ApiResponse({
    status: 200,
    description: 'Asset details retrieved successfully.',
    type: FixedAssetResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Asset not found.' })
  public async getAsset(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<FixedAssetResponseDto> {
    const query = new GetFixedAssetByIdQuery({ id, tenantId: user?.tenantId ?? undefined });
    const result = await this.getFixedAssetByIdHandler.execute(query);
    if (!result.isSuccess) {
      throw new NotFoundException(result.error);
    }
    return result.value as unknown as FixedAssetResponseDto;
  }

  @Get(':id/history')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER')
  @Permissions('assets.read')
  @ApiOperation({
    summary: 'Get full immutable lifecycle audit event history for an asset',
    description:
      'Retrieves chronological domain lifecycle events for regulatory and compliance auditing.',
  })
  @ApiParam({ name: 'id', description: 'Unique Fixed Asset ID' })
  @ApiResponse({ status: 200, description: 'Lifecycle audit history retrieved successfully.' })
  public async getAssetHistory(
    @Param('id') id: string,
    @Query() queryDto: GetAssetHistoryQueryDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    const query = new GetAssetHistoryQuery({
      assetId: id,
      tenantId: user?.tenantId ?? undefined,
      eventType: queryDto.eventType,
      recordedByUserId: queryDto.recordedByUserId,
      fromDate: queryDto.fromDate,
      toDate: queryDto.toDate,
      page: queryDto.page,
      pageSize: queryDto.limit,
      sortBy: 'recordedAt',
      sortOrder: queryDto.sortOrder,
    });

    const result = await this.getAssetHistoryHandler.execute(query);
    if (!result.isSuccess) {
      const msg = getErrorMessage(result.error);
      if (msg.toLowerCase().includes('not found')) {
        throw new NotFoundException(msg);
      }
      throw new BadRequestException(msg);
    }
    return result.value;
  }

  @Get(':id/maintenance')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER', 'TRAINER')
  @Permissions('assets.read')
  @ApiOperation({
    summary: 'Get servicing and maintenance history for an asset',
    description:
      'Retrieves historical maintenance logs, service dates, and technician work orders.',
  })
  @ApiParam({ name: 'id', description: 'Unique Fixed Asset ID' })
  @ApiResponse({ status: 200, description: 'Maintenance history retrieved successfully.' })
  public async getMaintenanceHistory(
    @Param('id') id: string,
    @Query() queryDto: GetMaintenanceHistoryQueryDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    const query = new GetMaintenanceHistoryQuery({
      assetId: id,
      tenantId: user?.tenantId ?? undefined,
      performedBy: queryDto.performedBy,
      fromDate: queryDto.fromDate,
      toDate: queryDto.toDate,
      page: queryDto.page,
      pageSize: queryDto.limit,
      sortBy: 'serviceDate',
      sortOrder: queryDto.sortOrder,
    });

    const result = await this.getMaintenanceHistoryHandler.execute(query);
    if (!result.isSuccess) {
      const msg = getErrorMessage(result.error);
      if (msg.toLowerCase().includes('not found')) {
        throw new NotFoundException(msg);
      }
      throw new BadRequestException(msg);
    }
    return result.value;
  }

  @Get('valuation/summary')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER')
  @Permissions('assets.read', 'billing.read')
  @ApiOperation({
    summary: 'Get total capital equipment carrying and CAPEX purchase valuation summary',
    description:
      'Aggregates balance sheet carrying value across active capital equipment according to the authoritative lifecycle inclusion matrix.',
  })
  @ApiResponse({
    status: 200,
    description: 'Fixed asset estate valuation computed successfully.',
    type: FixedAssetValuationSummaryResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: Requires assets.read AND billing.read permissions.',
  })
  public async getValuationSummary(
    @CurrentUser() user: AuthenticatedUserContext,
    @Query('category') category?: string,
    @Query('includeDecommissioned') includeDecommissioned?: string,
  ): Promise<FixedAssetValuationSummaryResponseDto> {
    const query = new GetFixedAssetValuationSummaryQuery({
      tenantId: user?.tenantId ?? undefined,
      category,
      includeDecommissioned: includeDecommissioned === 'true' || includeDecommissioned === '1',
    });
    const result = await this.getFixedAssetValuationSummaryHandler.execute(query);
    if (!result.isSuccess) {
      throw new BadRequestException(getErrorMessage(result.error));
    }
    return result.value;
  }

  @Get(':id/valuation')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER')
  @Permissions('assets.read', 'billing.read')
  @ApiOperation({
    summary: 'Get asset financial valuation and purchase acquisition details',
    description: 'Restricted financial valuation inquiry protected by dual-permission composition.',
  })
  @ApiParam({ name: 'id', description: 'Unique Fixed Asset ID' })
  @ApiResponse({
    status: 200,
    description: 'Asset valuation details retrieved successfully.',
    type: FixedAssetValuationResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Forbidden: Requires assets.read AND billing.read.' })
  public async getAssetValue(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<FixedAssetValuationResponseDto> {
    const query = new GetAssetValueQuery({ assetId: id, tenantId: user?.tenantId ?? undefined });
    const result = await this.getAssetValueHandler.execute(query);
    if (!result.isSuccess) {
      const msg = getErrorMessage(result.error);
      if (msg.toLowerCase().includes('not found')) {
        throw new NotFoundException(msg);
      }
      throw new BadRequestException(msg);
    }
    return {
      assetId: result.value.assetId,
      assetTag: result.value.assetTag,
      name: result.value.name,
      purchaseValueAmount: result.value.purchaseValueAmount,
      purchaseValueCurrency: result.value.purchaseValueCurrency,
      currentEstimatedValueAmount: result.value.currentEstimatedValueAmount,
      currentEstimatedValueCurrency: result.value.currentEstimatedValueCurrency,
      lastValuationDate: result.value.lastValuationDate.toISOString(),
    };
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER')
  @Permissions('assets.write')
  @ApiOperation({ summary: 'Commission and register a new fixed asset' })
  @ApiResponse({
    status: 201,
    description: 'Asset created successfully.',
    type: FixedAssetResponseDto,
  })
  public async createAsset(
    @Body() dto: CreateFixedAssetRequestDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<FixedAssetResponseDto> {
    const command = new CreateFixedAssetCommand({
      tenantId: user?.tenantId ?? undefined,
      assetTag: dto.assetTag,
      name: dto.name,
      description: dto.description,
      category: dto.category,
      purchaseDate: new Date(dto.purchaseDate),
      purchaseValue: {
        amount: dto.purchaseValueAmount,
        currency: dto.purchaseValueCurrency ?? 'USD',
      },
      currentEstimatedValue:
        dto.currentEstimatedValueAmount !== undefined
          ? {
              amount: dto.currentEstimatedValueAmount,
              currency: dto.purchaseValueCurrency ?? 'USD',
            }
          : undefined,
      condition: dto.condition,
      status: dto.status,
      location: dto.location,
      notes: dto.notes,
      actorId: user.userId,
    });

    const result = await this.createFixedAssetHandler.execute(command);
    if (!result.isSuccess) {
      throw new BadRequestException(result.error);
    }
    return result.value as unknown as FixedAssetResponseDto;
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER')
  @Permissions('assets.write')
  @ApiOperation({ summary: 'Update fixed asset descriptive metadata' })
  @ApiParam({ name: 'id', description: 'Unique Fixed Asset ID' })
  public async updateDetails(
    @Param('id') id: string,
    @Body() dto: UpdateFixedAssetDetailsRequestDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<FixedAssetResponseDto> {
    const command = new UpdateFixedAssetDetailsCommand({
      id,
      tenantId: user?.tenantId ?? undefined,
      name: dto.name,
      description: dto.description,
      notes: dto.notes,
      reason: dto.reason,
      actorId: user.userId,
    });

    const result = await this.updateFixedAssetDetailsHandler.execute(command);
    if (!result.isSuccess) {
      const msg = getErrorMessage(result.error);
      if (msg.toLowerCase().includes('not found')) {
        throw new NotFoundException(msg);
      }
      throw new BadRequestException(msg);
    }
    return result.value as unknown as FixedAssetResponseDto;
  }

  @Post(':id/transfer')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER', 'TRAINER')
  @Permissions('assets.write')
  @ApiOperation({
    summary: 'Transfer physical location of a fixed asset',
    description:
      'Relocates asset between facilities, rooms, or zones, producing an immutable location history audit record.',
  })
  @ApiParam({ name: 'id', description: 'Unique Fixed Asset ID' })
  public async transferLocation(
    @Param('id') id: string,
    @Body() dto: TransferFixedAssetLocationRequestDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<FixedAssetResponseDto> {
    const command = new TransferFixedAssetLocationCommand({
      id,
      tenantId: user?.tenantId ?? undefined,
      location: dto.location,
      reason: dto.reason,
      actorId: user.userId,
    });

    const result = await this.transferFixedAssetLocationHandler.execute(command);
    if (!result.isSuccess) {
      const msg = getErrorMessage(result.error);
      if (msg.toLowerCase().includes('not found')) {
        throw new NotFoundException(msg);
      }
      throw new BadRequestException(msg);
    }
    return result.value as unknown as FixedAssetResponseDto;
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER')
  @Permissions('assets.write')
  @ApiOperation({
    summary: 'Transition lifecycle status of a fixed asset',
    description:
      'Enforces aggregate state-machine rules (IN_SERVICE, MAINTENANCE, STORAGE, DECOMMISSIONED, DISPOSED).',
  })
  @ApiParam({ name: 'id', description: 'Unique Fixed Asset ID' })
  public async changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeFixedAssetStatusRequestDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<FixedAssetResponseDto> {
    const command = new ChangeFixedAssetStatusCommand({
      id,
      tenantId: user?.tenantId ?? undefined,
      status: dto.status,
      reason: dto.reason,
      actorId: user.userId,
    });

    const result = await this.changeFixedAssetStatusHandler.execute(command);
    if (!result.isSuccess) {
      const msg = getErrorMessage(result.error);
      if (msg.toLowerCase().includes('not found')) {
        throw new NotFoundException(msg);
      }
      throw new BadRequestException(msg);
    }
    return result.value as unknown as FixedAssetResponseDto;
  }

  @Post(':id/condition')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER', 'TRAINER')
  @Permissions('assets.write')
  @ApiOperation({
    summary: 'Update physical operational condition rating of an asset',
    description: 'Rates physical condition (EXCELLENT, GOOD, FAIR, POOR, DAMAGED).',
  })
  @ApiParam({ name: 'id', description: 'Unique Fixed Asset ID' })
  public async changeCondition(
    @Param('id') id: string,
    @Body() dto: UpdateFixedAssetConditionRequestDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<FixedAssetResponseDto> {
    const command = new UpdateFixedAssetConditionCommand({
      id,
      tenantId: user?.tenantId ?? undefined,
      condition: dto.condition,
      reason: dto.reason,
      actorId: user.userId,
    });

    const result = await this.updateFixedAssetConditionHandler.execute(command);
    if (!result.isSuccess) {
      const msg = getErrorMessage(result.error);
      if (msg.toLowerCase().includes('not found')) {
        throw new NotFoundException(msg);
      }
      throw new BadRequestException(msg);
    }
    return result.value as unknown as FixedAssetResponseDto;
  }

  @Post(':id/maintenance')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER', 'TRAINER')
  @Permissions('assets.write')
  @ApiOperation({
    summary: 'Record servicing or maintenance work order on an asset',
    description:
      'Appends a permanent maintenance record, auto-transitions status to IN_SERVICE if needed, and logs history.',
  })
  @ApiParam({ name: 'id', description: 'Unique Fixed Asset ID' })
  public async recordMaintenance(
    @Param('id') id: string,
    @Body() dto: RecordAssetMaintenanceRequestDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    const command = new RecordAssetMaintenanceCommand({
      assetId: id,
      tenantId: user?.tenantId ?? undefined,
      serviceDate: new Date(dto.serviceDate),
      description: dto.description,
      cost: {
        amount: dto.costAmount,
        currency: dto.costCurrency ?? 'USD',
      },
      performedBy: dto.performedBy,
      updateConditionTo: dto.updateConditionTo,
      notes: dto.notes,
      actorId: user.userId,
    });

    const result = await this.recordAssetMaintenanceHandler.execute(command);
    if (!result.isSuccess) {
      const msg = getErrorMessage(result.error);
      if (msg.toLowerCase().includes('not found')) {
        throw new NotFoundException(msg);
      }
      throw new BadRequestException(msg);
    }
    return result.value;
  }

  @Post(':id/valuation')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER')
  @Permissions('assets.write', 'billing.read')
  @ApiOperation({
    summary: 'Update current estimated fair value of a fixed asset',
    description:
      'Appraisal / write-down revaluation protected by dual-permission (assets.write + billing.read).',
  })
  @ApiParam({ name: 'id', description: 'Unique Fixed Asset ID' })
  @ApiResponse({ status: 403, description: 'Forbidden: Requires assets.write AND billing.read.' })
  public async updateValuation(
    @Param('id') id: string,
    @Body() dto: UpdateFixedAssetValuationRequestDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<FixedAssetResponseDto> {
    const command = new UpdateFixedAssetValuationCommand({
      id,
      tenantId: user?.tenantId ?? undefined,
      estimatedValue: {
        amount: dto.estimatedValueAmount,
        currency: dto.currency ?? 'USD',
      },
      reason: dto.reason,
      actorId: user.userId,
    });

    const result = await this.updateFixedAssetValuationHandler.execute(command);
    if (!result.isSuccess) {
      const msg = getErrorMessage(result.error);
      if (msg.toLowerCase().includes('not found')) {
        throw new NotFoundException(msg);
      }
      throw new BadRequestException(msg);
    }
    return result.value as unknown as FixedAssetResponseDto;
  }
}
