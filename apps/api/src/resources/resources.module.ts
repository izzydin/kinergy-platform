import { Module } from '@nestjs/common';
import { PrismaService } from '../platform/persistence/prisma/prisma.service';
import {
  PrismaInventoryItemRepository,
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
} from '@kinergy-platform/core';
import { InventoryController } from './controllers/inventory.controller';

export const RESOURCES_EVENT_PUBLISHER_TOKEN = 'ResourcesEventPublisherPort';

class DefaultResourcesEventPublisher implements ResourcesEventPublisherPort {
  async publish(_events: Parameters<ResourcesEventPublisherPort['publish']>[0]): Promise<void> {}
}

@Module({
  controllers: [InventoryController],
  providers: [
    {
      provide: PrismaInventoryItemRepository,
      useFactory: (prisma: PrismaService) => new PrismaInventoryItemRepository(prisma),
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
  ],
  exports: [
    PrismaInventoryItemRepository,
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
    InventoryController,
  ],
})
export class ResourcesModule {}
