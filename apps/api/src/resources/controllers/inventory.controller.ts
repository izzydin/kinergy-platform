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
  CreateInventoryItemCommand,
  CreateInventoryItemHandler,
  UpdateInventoryItemCommand,
  UpdateInventoryItemHandler,
  ArchiveInventoryItemCommand,
  ArchiveInventoryItemHandler,
  ActivateInventoryItemCommand,
  ActivateInventoryItemHandler,
  ReceiveStockCommand,
  ReceiveStockHandler,
  SellStockCommand,
  SellStockHandler,
  ConsumeStockCommand,
  ConsumeStockHandler,
  AdjustStockCommand,
  AdjustStockHandler,
  GetInventoryItemByIdQuery,
  GetInventoryItemByIdHandler,
  ListInventoryItemsQuery,
  ListInventoryItemsHandler,
  ListInventoryItemsFilter,
  GetStockLevelQuery,
  GetStockLevelHandler,
  ListStockMovementsQuery,
  ListStockMovementsHandler,
  GetLowStockItemsQuery,
  GetLowStockItemsHandler,
  GetInventoryValuationQuery,
  GetInventoryValuationHandler,
  UnitOfMeasure,
} from '@kinergy-platform/core';
import {
  CreateInventoryItemRequestDto,
  UpdateInventoryItemRequestDto,
  ReceiveStockRequestDto,
  SellStockRequestDto,
  ConsumeStockRequestDto,
  AdjustStockRequestDto,
  ListInventoryItemsQueryDto,
  InventoryItemResponseDto,
  InventoryValuationResponseDto,
} from '../dto';

const getErrorMessage = (error: unknown): string => {
  if (!error) return 'Operation failed';
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
};

@ApiTags('Resources - Consumable Inventory')
@ApiBearerAuth()
@UseGuards(AuthenticationGuard, AuthorizationGuard)
@Controller('api/v1/resources/inventory')
export class InventoryController {
  constructor(
    private readonly createInventoryItemHandler: CreateInventoryItemHandler,
    private readonly updateInventoryItemHandler: UpdateInventoryItemHandler,
    private readonly archiveInventoryItemHandler: ArchiveInventoryItemHandler,
    private readonly activateInventoryItemHandler: ActivateInventoryItemHandler,
    private readonly receiveStockHandler: ReceiveStockHandler,
    private readonly sellStockHandler: SellStockHandler,
    private readonly consumeStockHandler: ConsumeStockHandler,
    private readonly adjustStockHandler: AdjustStockHandler,
    private readonly getInventoryItemByIdHandler: GetInventoryItemByIdHandler,
    private readonly listInventoryItemsHandler: ListInventoryItemsHandler,
    private readonly getStockLevelHandler: GetStockLevelHandler,
    private readonly listStockMovementsHandler: ListStockMovementsHandler,
    private readonly getLowStockItemsHandler: GetLowStockItemsHandler,
    private readonly getInventoryValuationHandler: GetInventoryValuationHandler,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER', 'KITCHEN_STAFF', 'RECEPTIONIST', 'TRAINER')
  @Permissions('inventory.read')
  @ApiOperation({
    summary: 'List consumable inventory products',
    description: 'Retrieves catalog items with optional search, category, and status filtering.',
  })
  @ApiResponse({ status: 200, description: 'Catalog items retrieved successfully.' })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({ status: 403, description: 'Insufficient privileges.' })
  public async listItems(
    @Query() queryDto: ListInventoryItemsQueryDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    const query = new ListInventoryItemsQuery({
      tenantId: user?.tenantId ?? undefined,
      filter: {
        search: queryDto.search,
        category: queryDto.category,
        status: queryDto.status,
        page: queryDto.page,
        limit: queryDto.limit,
        sortBy: queryDto.sortBy as ListInventoryItemsFilter['sortBy'],
        sortOrder: queryDto.sortOrder,
      },
    });

    const result = await this.listInventoryItemsHandler.execute(query);
    if (!result.isSuccess) {
      throw new BadRequestException(result.error);
    }
    return result.value;
  }

  @Get('low-stock')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER', 'KITCHEN_STAFF')
  @Permissions('inventory.read')
  @ApiOperation({
    summary: 'List low stock products',
    description: 'Retrieves items where stock on hand has fallen below reorder threshold.',
  })
  @ApiResponse({ status: 200, description: 'Low stock items retrieved successfully.' })
  public async getLowStock(@CurrentUser() user: AuthenticatedUserContext) {
    const query = new GetLowStockItemsQuery({ tenantId: user?.tenantId ?? undefined });
    const result = await this.getLowStockItemsHandler.execute(query);
    if (!result.isSuccess) {
      throw new BadRequestException(result.error);
    }
    return result.value;
  }

  @Get('valuation')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER')
  @Permissions('inventory.read', 'billing.read')
  @ApiOperation({
    summary: 'Get total working capital valuation of consumable inventory',
    description:
      'Computes total acquisition cost value across all active stock on hand in exact integer cents.',
  })
  @ApiResponse({
    status: 200,
    description: 'Inventory valuation computed successfully.',
    type: InventoryValuationResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Authentication required.' })
  @ApiResponse({
    status: 403,
    description: 'Forbidden: Requires inventory.read AND billing.read permissions.',
  })
  public async getValuation(
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<InventoryValuationResponseDto> {
    const query = new GetInventoryValuationQuery({ tenantId: user?.tenantId ?? undefined });
    const result = await this.getInventoryValuationHandler.execute(query);
    if (!result.isSuccess) {
      throw new BadRequestException(result.error);
    }
    return {
      totalDistinctItems: result.value.totalDistinctItems,
      totalQuantityUnits: result.value.totalQuantityUnits,
      totalValueAmount: result.value.totalValueAmount,
      currency: result.value.currency,
      calculatedAt: result.value.calculatedAt,
    };
  }

  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER', 'KITCHEN_STAFF', 'RECEPTIONIST', 'TRAINER')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Get inventory item by ID' })
  @ApiParam({ name: 'id', description: 'Unique Inventory Item ID' })
  @ApiResponse({
    status: 200,
    description: 'Item retrieved successfully.',
    type: InventoryItemResponseDto,
  })
  @ApiResponse({ status: 404, description: 'Item not found.' })
  public async getItem(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<InventoryItemResponseDto> {
    const query = new GetInventoryItemByIdQuery({ id, tenantId: user?.tenantId ?? undefined });
    const result = await this.getInventoryItemByIdHandler.execute(query);
    if (!result.isSuccess) {
      throw new NotFoundException(result.error);
    }
    return result.value as unknown as InventoryItemResponseDto;
  }

  @Get(':id/stock-level')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER', 'KITCHEN_STAFF', 'RECEPTIONIST', 'TRAINER')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Get physical stock on hand for a product' })
  @ApiParam({ name: 'id', description: 'Unique Inventory Item ID' })
  public async getStockLevel(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    const query = new GetStockLevelQuery({ itemId: id, tenantId: user?.tenantId ?? undefined });
    const result = await this.getStockLevelHandler.execute(query);
    if (!result.isSuccess) {
      throw new NotFoundException(result.error);
    }
    return result.value;
  }

  @Get(':id/movements')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER', 'KITCHEN_STAFF')
  @Permissions('inventory.read')
  @ApiOperation({ summary: 'Get chronological stock movement ledger for a product' })
  @ApiParam({ name: 'id', description: 'Unique Inventory Item ID' })
  @ApiResponse({ status: 200, description: 'Movements retrieved successfully.' })
  public async getMovements(
    @Param('id') id: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @CurrentUser() user: AuthenticatedUserContext = {} as AuthenticatedUserContext,
  ) {
    const query = new ListStockMovementsQuery({
      itemId: id,
      tenantId: user?.tenantId ?? undefined,
      page: page ? Number(page) : 1,
      pageSize: limit ? Number(limit) : 20,
    });
    const result = await this.listStockMovementsHandler.execute(query);
    if (!result.isSuccess) {
      throw new BadRequestException(result.error);
    }
    return result.value;
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER', 'KITCHEN_STAFF')
  @Permissions('inventory.write')
  @ApiOperation({ summary: 'Create a new consumable inventory catalog product' })
  @ApiResponse({
    status: 201,
    description: 'Product created successfully.',
    type: InventoryItemResponseDto,
  })
  public async createItem(
    @Body() dto: CreateInventoryItemRequestDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<InventoryItemResponseDto> {
    const command = new CreateInventoryItemCommand({
      tenantId: user?.tenantId ?? undefined,
      sku: dto.sku,
      name: dto.name,
      description: dto.description,
      category: dto.category,
      purchaseCost: { amount: dto.unitCost, currency: 'USD' },
      sellingPrice: { amount: dto.sellingPrice, currency: 'USD' },
      initialStock: dto.quantityOnHand ?? 0,
      minimumStock: dto.reorderThreshold ?? 5,
      unit: (dto.unitOfMeasure as UnitOfMeasure) ?? UnitOfMeasure.UNITS,
      actorId: user.userId,
    });

    const result = await this.createInventoryItemHandler.execute(command);
    if (!result.isSuccess) {
      throw new BadRequestException(result.error);
    }
    return result.value as unknown as InventoryItemResponseDto;
  }

  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER', 'KITCHEN_STAFF')
  @Permissions('inventory.write')
  @ApiOperation({
    summary: 'Update consumable inventory item metadata and pricing',
    description:
      'Updates product title, description, pricing, and reorder thresholds. Stock on hand is immutable here.',
  })
  @ApiParam({ name: 'id', description: 'Unique Inventory Item ID' })
  public async updateItem(
    @Param('id') id: string,
    @Body() dto: UpdateInventoryItemRequestDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<InventoryItemResponseDto> {
    const command = new UpdateInventoryItemCommand({
      id,
      tenantId: user?.tenantId ?? undefined,
      name: dto.name,
      description: dto.description,
      category: dto.category,
      purchaseCost:
        dto.unitCost !== undefined ? { amount: dto.unitCost, currency: 'USD' } : undefined,
      sellingPrice:
        dto.sellingPrice !== undefined ? { amount: dto.sellingPrice, currency: 'USD' } : undefined,
      minimumStock: dto.reorderThreshold,
      unit: dto.unitOfMeasure as UnitOfMeasure | undefined,
      actorId: user.userId,
    });

    const result = await this.updateInventoryItemHandler.execute(command);
    if (!result.isSuccess) {
      const msg = getErrorMessage(result.error);
      if (msg.toLowerCase().includes('not found')) {
        throw new NotFoundException(msg);
      }
      throw new BadRequestException(msg);
    }
    return result.value as unknown as InventoryItemResponseDto;
  }

  @Post(':id/archive')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER')
  @Permissions('inventory.write')
  @ApiOperation({ summary: 'Archive a product' })
  public async archiveItem(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<InventoryItemResponseDto> {
    const command = new ArchiveInventoryItemCommand({
      id,
      tenantId: user?.tenantId ?? undefined,
      actorId: user.userId,
    });
    const result = await this.archiveInventoryItemHandler.execute(command);
    if (!result.isSuccess) {
      const msg = getErrorMessage(result.error);
      if (msg.toLowerCase().includes('not found')) {
        throw new NotFoundException(msg);
      }
      throw new BadRequestException(msg);
    }
    return result.value as unknown as InventoryItemResponseDto;
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER')
  @Permissions('inventory.write')
  @ApiOperation({ summary: 'Reactivate an archived product' })
  public async activateItem(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ): Promise<InventoryItemResponseDto> {
    const command = new ActivateInventoryItemCommand({
      id,
      tenantId: user?.tenantId ?? undefined,
      actorId: user.userId,
    });
    const result = await this.activateInventoryItemHandler.execute(command);
    if (!result.isSuccess) {
      const msg = getErrorMessage(result.error);
      if (msg.toLowerCase().includes('not found')) {
        throw new NotFoundException(msg);
      }
      throw new BadRequestException(msg);
    }
    return result.value as unknown as InventoryItemResponseDto;
  }

  @Post(':id/receive')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER', 'KITCHEN_STAFF')
  @Permissions('inventory.write')
  @ApiOperation({ summary: 'Record receipt of purchased stock' })
  public async receiveStock(
    @Param('id') id: string,
    @Body() dto: ReceiveStockRequestDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    const command = new ReceiveStockCommand({
      itemId: id,
      tenantId: user?.tenantId ?? undefined,
      quantity: dto.quantity,
      unitCost: dto.unitCost !== undefined ? { amount: dto.unitCost, currency: 'USD' } : undefined,
      referenceId: dto.referenceNumber,
      reason: dto.notes ?? 'Stock received via purchase invoice',
      actorId: user.userId,
    });
    const result = await this.receiveStockHandler.execute(command);
    if (!result.isSuccess) {
      const msg = getErrorMessage(result.error);
      if (msg.toLowerCase().includes('not found')) {
        throw new NotFoundException(msg);
      }
      throw new BadRequestException(msg);
    }
    return result.value;
  }

  @Post(':id/sell')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER', 'KITCHEN_STAFF', 'RECEPTIONIST')
  @Permissions('inventory.write')
  @ApiOperation({ summary: 'Record retail sale of stock' })
  public async sellStock(
    @Param('id') id: string,
    @Body() dto: SellStockRequestDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    const command = new SellStockCommand({
      itemId: id,
      tenantId: user?.tenantId ?? undefined,
      quantity: dto.quantity,
      sellingPrice:
        dto.unitPrice !== undefined ? { amount: dto.unitPrice, currency: 'USD' } : undefined,
      referenceId: dto.referenceId,
      reason: dto.notes ?? 'Retail point of sale',
      actorId: user.userId,
    });
    const result = await this.sellStockHandler.execute(command);
    if (!result.isSuccess) {
      const msg = getErrorMessage(result.error);
      if (msg.toLowerCase().includes('not found')) {
        throw new NotFoundException(msg);
      }
      throw new BadRequestException(msg);
    }
    return result.value;
  }

  @Post(':id/consume')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER', 'KITCHEN_STAFF', 'TRAINER')
  @Permissions('inventory.write')
  @ApiOperation({ summary: 'Record consumption of stock in treatment or clinical session' })
  public async consumeStock(
    @Param('id') id: string,
    @Body() dto: ConsumeStockRequestDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    const command = new ConsumeStockCommand({
      itemId: id,
      tenantId: user?.tenantId ?? undefined,
      quantity: dto.quantity,
      referenceId: dto.treatmentSessionId,
      reason: dto.notes ?? 'Treatment consumption',
      actorId: user.userId,
    });
    const result = await this.consumeStockHandler.execute(command);
    if (!result.isSuccess) {
      const msg = getErrorMessage(result.error);
      if (msg.toLowerCase().includes('not found')) {
        throw new NotFoundException(msg);
      }
      throw new BadRequestException(msg);
    }
    return result.value;
  }

  @Post(':id/adjust')
  @HttpCode(HttpStatus.OK)
  @Roles('ADMIN', 'SUPER_ADMIN', 'OWNER', 'KITCHEN_STAFF')
  @Permissions('inventory.write')
  @ApiOperation({ summary: 'Record physical inventory count adjustment' })
  public async adjustStock(
    @Param('id') id: string,
    @Body() dto: AdjustStockRequestDto,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    const command = new AdjustStockCommand({
      itemId: id,
      tenantId: user?.tenantId ?? undefined,
      type: dto.deltaQuantity >= 0 ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
      quantity: Math.abs(dto.deltaQuantity),
      reason: dto.reason,
      actorId: user.userId,
    });
    const result = await this.adjustStockHandler.execute(command);
    if (!result.isSuccess) {
      if (result.error.toLowerCase().includes('not found')) {
        throw new NotFoundException(result.error);
      }
      throw new BadRequestException(result.error);
    }
    return result.value;
  }
}
