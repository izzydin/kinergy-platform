import { Module } from '@nestjs/common';
import { PrismaService } from '../platform/persistence/prisma/prisma.service';
import {
  PrismaInventoryItemRepository,
  PrismaFixedAssetRepository,
  ResourcesEventPublisherPort,
  CreateInventoryItemHandler,
  UpdateInventoryItemHandler,
  ArchiveInventoryItemHandler,
  ActivateInventoryItemHandler,
  ReceiveStockHandler,
  SellStockHandler,
  ConsumeStockHandler,
  AdjustStockHandler,
  GetInventoryItemByIdHandler,
  ListInventoryItemsHandler,
  GetStockLevelHandler,
  ListStockMovementsHandler,
  GetLowStockItemsHandler,
  GetInventoryValuationHandler,
  CreateFixedAssetHandler,
  UpdateFixedAssetDetailsHandler,
  TransferFixedAssetLocationHandler,
  ChangeFixedAssetStatusHandler,
  UpdateFixedAssetConditionHandler,
  RecordAssetMaintenanceHandler,
  UpdateFixedAssetValuationHandler,
  GetFixedAssetByIdHandler,
  GetFixedAssetByTagHandler,
  ListFixedAssetsHandler,
  GetAssetHistoryHandler,
  GetMaintenanceHistoryHandler,
  GetAssetValueHandler,
} from '@kinergy-platform/core';
import { InventoryController } from './controllers/inventory.controller';
import { FixedAssetsController } from './controllers/fixed-assets.controller';

export const RESOURCES_EVENT_PUBLISHER_TOKEN = 'ResourcesEventPublisherPort';

class DefaultResourcesEventPublisher implements ResourcesEventPublisherPort {
  async publish(_events: Parameters<ResourcesEventPublisherPort['publish']>[0]): Promise<void> {}
}

@Module({
  controllers: [InventoryController, FixedAssetsController],
  providers: [
    {
      provide: PrismaInventoryItemRepository,
      useFactory: (prisma: PrismaService) => new PrismaInventoryItemRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: PrismaFixedAssetRepository,
      useFactory: (prisma: PrismaService) => new PrismaFixedAssetRepository(prisma),
      inject: [PrismaService],
    },
    {
      provide: RESOURCES_EVENT_PUBLISHER_TOKEN,
      useClass: DefaultResourcesEventPublisher,
    },

    // Consumable Inventory Command Handlers
    {
      provide: CreateInventoryItemHandler,
      useFactory: (repo: PrismaInventoryItemRepository, publisher: ResourcesEventPublisherPort) =>
        new CreateInventoryItemHandler(repo, publisher),
      inject: [PrismaInventoryItemRepository, RESOURCES_EVENT_PUBLISHER_TOKEN],
    },
    {
      provide: UpdateInventoryItemHandler,
      useFactory: (repo: PrismaInventoryItemRepository, publisher: ResourcesEventPublisherPort) =>
        new UpdateInventoryItemHandler(repo, publisher),
      inject: [PrismaInventoryItemRepository, RESOURCES_EVENT_PUBLISHER_TOKEN],
    },
    {
      provide: ArchiveInventoryItemHandler,
      useFactory: (repo: PrismaInventoryItemRepository, publisher: ResourcesEventPublisherPort) =>
        new ArchiveInventoryItemHandler(repo, publisher),
      inject: [PrismaInventoryItemRepository, RESOURCES_EVENT_PUBLISHER_TOKEN],
    },
    {
      provide: ActivateInventoryItemHandler,
      useFactory: (repo: PrismaInventoryItemRepository, publisher: ResourcesEventPublisherPort) =>
        new ActivateInventoryItemHandler(repo, publisher),
      inject: [PrismaInventoryItemRepository, RESOURCES_EVENT_PUBLISHER_TOKEN],
    },
    {
      provide: ReceiveStockHandler,
      useFactory: (repo: PrismaInventoryItemRepository, publisher: ResourcesEventPublisherPort) =>
        new ReceiveStockHandler(repo, publisher),
      inject: [PrismaInventoryItemRepository, RESOURCES_EVENT_PUBLISHER_TOKEN],
    },
    {
      provide: SellStockHandler,
      useFactory: (repo: PrismaInventoryItemRepository, publisher: ResourcesEventPublisherPort) =>
        new SellStockHandler(repo, publisher),
      inject: [PrismaInventoryItemRepository, RESOURCES_EVENT_PUBLISHER_TOKEN],
    },
    {
      provide: ConsumeStockHandler,
      useFactory: (repo: PrismaInventoryItemRepository, publisher: ResourcesEventPublisherPort) =>
        new ConsumeStockHandler(repo, publisher),
      inject: [PrismaInventoryItemRepository, RESOURCES_EVENT_PUBLISHER_TOKEN],
    },
    {
      provide: AdjustStockHandler,
      useFactory: (repo: PrismaInventoryItemRepository, publisher: ResourcesEventPublisherPort) =>
        new AdjustStockHandler(repo, publisher),
      inject: [PrismaInventoryItemRepository, RESOURCES_EVENT_PUBLISHER_TOKEN],
    },

    // Consumable Inventory Query Handlers
    {
      provide: GetInventoryItemByIdHandler,
      useFactory: (repo: PrismaInventoryItemRepository) => new GetInventoryItemByIdHandler(repo),
      inject: [PrismaInventoryItemRepository],
    },
    {
      provide: ListInventoryItemsHandler,
      useFactory: (repo: PrismaInventoryItemRepository) => new ListInventoryItemsHandler(repo),
      inject: [PrismaInventoryItemRepository],
    },
    {
      provide: GetStockLevelHandler,
      useFactory: (repo: PrismaInventoryItemRepository) => new GetStockLevelHandler(repo),
      inject: [PrismaInventoryItemRepository],
    },
    {
      provide: ListStockMovementsHandler,
      useFactory: (repo: PrismaInventoryItemRepository) => new ListStockMovementsHandler(repo),
      inject: [PrismaInventoryItemRepository],
    },
    {
      provide: GetLowStockItemsHandler,
      useFactory: (repo: PrismaInventoryItemRepository) => new GetLowStockItemsHandler(repo),
      inject: [PrismaInventoryItemRepository],
    },
    {
      provide: GetInventoryValuationHandler,
      useFactory: (repo: PrismaInventoryItemRepository) => new GetInventoryValuationHandler(repo),
      inject: [PrismaInventoryItemRepository],
    },

    // Fixed Assets Command Handlers
    {
      provide: CreateFixedAssetHandler,
      useFactory: (repo: PrismaFixedAssetRepository, publisher: ResourcesEventPublisherPort) =>
        new CreateFixedAssetHandler(repo, publisher),
      inject: [PrismaFixedAssetRepository, RESOURCES_EVENT_PUBLISHER_TOKEN],
    },
    {
      provide: UpdateFixedAssetDetailsHandler,
      useFactory: (repo: PrismaFixedAssetRepository, publisher: ResourcesEventPublisherPort) =>
        new UpdateFixedAssetDetailsHandler(repo, publisher),
      inject: [PrismaFixedAssetRepository, RESOURCES_EVENT_PUBLISHER_TOKEN],
    },
    {
      provide: TransferFixedAssetLocationHandler,
      useFactory: (repo: PrismaFixedAssetRepository, publisher: ResourcesEventPublisherPort) =>
        new TransferFixedAssetLocationHandler(repo, publisher),
      inject: [PrismaFixedAssetRepository, RESOURCES_EVENT_PUBLISHER_TOKEN],
    },
    {
      provide: ChangeFixedAssetStatusHandler,
      useFactory: (repo: PrismaFixedAssetRepository, publisher: ResourcesEventPublisherPort) =>
        new ChangeFixedAssetStatusHandler(repo, publisher),
      inject: [PrismaFixedAssetRepository, RESOURCES_EVENT_PUBLISHER_TOKEN],
    },
    {
      provide: UpdateFixedAssetConditionHandler,
      useFactory: (repo: PrismaFixedAssetRepository, publisher: ResourcesEventPublisherPort) =>
        new UpdateFixedAssetConditionHandler(repo, publisher),
      inject: [PrismaFixedAssetRepository, RESOURCES_EVENT_PUBLISHER_TOKEN],
    },
    {
      provide: RecordAssetMaintenanceHandler,
      useFactory: (repo: PrismaFixedAssetRepository, publisher: ResourcesEventPublisherPort) =>
        new RecordAssetMaintenanceHandler(repo, publisher),
      inject: [PrismaFixedAssetRepository, RESOURCES_EVENT_PUBLISHER_TOKEN],
    },
    {
      provide: UpdateFixedAssetValuationHandler,
      useFactory: (repo: PrismaFixedAssetRepository, publisher: ResourcesEventPublisherPort) =>
        new UpdateFixedAssetValuationHandler(repo, publisher),
      inject: [PrismaFixedAssetRepository, RESOURCES_EVENT_PUBLISHER_TOKEN],
    },

    // Fixed Assets Query Handlers
    {
      provide: GetFixedAssetByIdHandler,
      useFactory: (repo: PrismaFixedAssetRepository) => new GetFixedAssetByIdHandler(repo),
      inject: [PrismaFixedAssetRepository],
    },
    {
      provide: GetFixedAssetByTagHandler,
      useFactory: (repo: PrismaFixedAssetRepository) => new GetFixedAssetByTagHandler(repo),
      inject: [PrismaFixedAssetRepository],
    },
    {
      provide: ListFixedAssetsHandler,
      useFactory: (repo: PrismaFixedAssetRepository) => new ListFixedAssetsHandler(repo),
      inject: [PrismaFixedAssetRepository],
    },
    {
      provide: GetAssetHistoryHandler,
      useFactory: (repo: PrismaFixedAssetRepository) => new GetAssetHistoryHandler(repo),
      inject: [PrismaFixedAssetRepository],
    },
    {
      provide: GetMaintenanceHistoryHandler,
      useFactory: (repo: PrismaFixedAssetRepository) => new GetMaintenanceHistoryHandler(repo),
      inject: [PrismaFixedAssetRepository],
    },
    {
      provide: GetAssetValueHandler,
      useFactory: (repo: PrismaFixedAssetRepository) => new GetAssetValueHandler(repo),
      inject: [PrismaFixedAssetRepository],
    },
  ],
  exports: [
    PrismaInventoryItemRepository,
    PrismaFixedAssetRepository,
    CreateInventoryItemHandler,
    UpdateInventoryItemHandler,
    ArchiveInventoryItemHandler,
    ActivateInventoryItemHandler,
    ReceiveStockHandler,
    SellStockHandler,
    ConsumeStockHandler,
    AdjustStockHandler,
    GetInventoryItemByIdHandler,
    ListInventoryItemsHandler,
    GetStockLevelHandler,
    ListStockMovementsHandler,
    GetLowStockItemsHandler,
    GetInventoryValuationHandler,
    CreateFixedAssetHandler,
    UpdateFixedAssetDetailsHandler,
    TransferFixedAssetLocationHandler,
    ChangeFixedAssetStatusHandler,
    UpdateFixedAssetConditionHandler,
    RecordAssetMaintenanceHandler,
    UpdateFixedAssetValuationHandler,
    GetFixedAssetByIdHandler,
    GetFixedAssetByTagHandler,
    ListFixedAssetsHandler,
    GetAssetHistoryHandler,
    GetMaintenanceHistoryHandler,
    GetAssetValueHandler,
    InventoryController,
    FixedAssetsController,
  ],
})
export class ResourcesModule {}
