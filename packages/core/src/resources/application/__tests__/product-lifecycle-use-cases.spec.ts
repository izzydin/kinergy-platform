import { InventoryItem } from '../../domain/inventory/inventory-item.aggregate';
import { InventoryCategory } from '../../domain/inventory/enums/inventory-category.enum';
import { UnitOfMeasure } from '../../domain/inventory/enums/unit-of-measure.enum';
import { InventoryItemStatus } from '../../domain/inventory/enums/inventory-item-status.enum';
import {
  InventoryItemRepository,
  FindInventoryItemsFilter,
} from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { ResourcesEventPublisherPort } from '../ports/resources-event-publisher.port';
import { DomainEvent } from '../../domain/shared/domain-event';

// Commands & Handlers
import { CreateInventoryItemCommand } from '../commands/create-inventory-item.command';
import { CreateInventoryItemHandler } from '../handlers/create-inventory-item.handler';
import { UpdateInventoryItemCommand } from '../commands/update-inventory-item.command';
import { UpdateInventoryItemHandler } from '../handlers/update-inventory-item.handler';
import { ArchiveInventoryItemCommand } from '../commands/archive-inventory-item.command';
import { ArchiveInventoryItemHandler } from '../handlers/archive-inventory-item.handler';
import { DeactivateInventoryItemCommand } from '../commands/deactivate-inventory-item.command';
import { DeactivateInventoryItemHandler } from '../handlers/deactivate-inventory-item.handler';
import { ActivateInventoryItemCommand } from '../commands/activate-inventory-item.command';
import { ActivateInventoryItemHandler } from '../handlers/activate-inventory-item.handler';

// Queries & Handlers
import { GetInventoryItemByIdQuery } from '../queries/get-inventory-item-by-id.query';
import { GetInventoryItemByIdHandler } from '../handlers/get-inventory-item-by-id.handler';
import { ListInventoryItemsQuery } from '../queries/list-inventory-items.query';
import { ListInventoryItemsHandler } from '../handlers/list-inventory-items.handler';

class InMemoryInventoryItemRepository implements InventoryItemRepository {
  private readonly items = new Map<string, InventoryItem>();

  async save(item: InventoryItem): Promise<void> {
    this.items.set(item.id.getValue(), item);
  }

  async findById(id: string): Promise<InventoryItem | null> {
    return this.items.get(id) || null;
  }

  async findBySku(sku: string, tenantId?: string): Promise<InventoryItem | null> {
    const normalizedSku = sku.trim().toUpperCase();
    for (const item of this.items.values()) {
      if (
        item.sku.value.toUpperCase() === normalizedSku &&
        (!tenantId || item.tenantId === tenantId)
      ) {
        return item;
      }
    }
    return null;
  }

  async findMany(filter?: FindInventoryItemsFilter): Promise<InventoryItem[]> {
    let result = Array.from(this.items.values());

    if (filter?.tenantId) {
      result = result.filter((item) => item.tenantId === filter.tenantId);
    }

    if (filter?.category) {
      const categories = Array.isArray(filter.category) ? filter.category : [filter.category];
      result = result.filter((item) => categories.includes(item.category));
    }

    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      result = result.filter((item) => statuses.includes(item.status));
    } else if (!filter?.includeArchived) {
      result = result.filter(
        (item) =>
          item.status === InventoryItemStatus.ACTIVE ||
          item.status === InventoryItemStatus.INACTIVE,
      );
    }

    if (filter?.search) {
      const q = filter.search.toLowerCase();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.sku.value.toLowerCase().includes(q) ||
          (item.description && item.description.toLowerCase().includes(q)),
      );
    }

    if (filter?.stockStatus === 'OUT_OF_STOCK') {
      result = result.filter((item) => item.isOutOfStock());
    } else if (filter?.stockStatus === 'LOW_STOCK') {
      result = result.filter((item) => item.isLowStock() && !item.isOutOfStock());
    } else if (filter?.stockStatus === 'IN_STOCK') {
      result = result.filter((item) => !item.isLowStock());
    } else if (filter?.lowStockOnly) {
      result = result.filter((item) => item.isLowStock());
    }

    // Sort
    const sortBy = filter?.sortBy ?? 'name';
    const isDesc = filter?.sortOrder === 'desc';
    result.sort((a, b) => {
      let comparison = 0;
      if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortBy === 'sku') {
        comparison = a.sku.value.localeCompare(b.sku.value);
      } else if (sortBy === 'quantityOnHand') {
        comparison = a.quantityOnHand.value - b.quantityOnHand.value;
      } else if (sortBy === 'sellingPrice') {
        comparison = a.sellingPrice.amount - b.sellingPrice.amount;
      } else if (sortBy === 'createdAt') {
        comparison = a.createdAt.getTime() - b.createdAt.getTime();
      }
      if (comparison === 0) {
        comparison = a.id.getValue().localeCompare(b.id.getValue());
      }
      return isDesc ? -comparison : comparison;
    });

    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? result.length;
    return result.slice(offset, offset + limit);
  }

  async count(filter?: FindInventoryItemsFilter): Promise<number> {
    const items = await this.findMany({ ...filter, limit: undefined, offset: undefined });
    return items.length;
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }

  clear(): void {
    this.items.clear();
  }
}

class MockEventPublisher implements ResourcesEventPublisherPort {
  public publishedEvents: DomainEvent[] = [];

  async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.publishedEvents.push(...events);
  }

  clear(): void {
    this.publishedEvents = [];
  }
}

describe('Product Lifecycle Application Use Cases', () => {
  let repository: InMemoryInventoryItemRepository;
  let eventPublisher: MockEventPublisher;

  let createHandler: CreateInventoryItemHandler;
  let updateHandler: UpdateInventoryItemHandler;
  let archiveHandler: ArchiveInventoryItemHandler;
  let deactivateHandler: DeactivateInventoryItemHandler;
  let activateHandler: ActivateInventoryItemHandler;
  let getByIdHandler: GetInventoryItemByIdHandler;
  let listHandler: ListInventoryItemsHandler;

  const TENANT_ID = 'tenant_kinergy_prime';
  const ACTOR_ID = 'usr_inventory_manager';

  beforeEach(() => {
    repository = new InMemoryInventoryItemRepository();
    eventPublisher = new MockEventPublisher();

    createHandler = new CreateInventoryItemHandler(repository, eventPublisher);
    updateHandler = new UpdateInventoryItemHandler(repository, eventPublisher);
    archiveHandler = new ArchiveInventoryItemHandler(repository, eventPublisher);
    deactivateHandler = new DeactivateInventoryItemHandler(repository, eventPublisher);
    activateHandler = new ActivateInventoryItemHandler(repository, eventPublisher);
    getByIdHandler = new GetInventoryItemByIdHandler(repository);
    listHandler = new ListInventoryItemsHandler(repository);
  });

  describe('CreateProduct (CreateInventoryItemHandler)', () => {
    it('creates a product successfully with opening stock and publishes domain events', async () => {
      const command = new CreateInventoryItemCommand({
        sku: 'TAPE-RIGID-01',
        name: 'Rigid Strapping Tape 38mm',
        description: 'High-tensile zinc oxide strapping tape',
        category: InventoryCategory.CLINICAL_SUPPLIES,
        unit: UnitOfMeasure.ROLLS,
        minimumStock: 10,
        initialStock: 25,
        purchaseCost: { amount: 8.5, currency: 'USD' },
        sellingPrice: { amount: 15.0, currency: 'USD' },
        locationRef: { facilityId: 'fac_main', roomRef: 'Storage A', binCode: 'BIN-12' },
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
      });

      const result = await createHandler.execute(command);

      expect(result.isSuccess).toBe(true);
      const dto = result.value;
      expect(dto.id).toBeDefined();
      expect(dto.sku).toBe('TAPE-RIGID-01');
      expect(dto.name).toBe('Rigid Strapping Tape 38mm');
      expect(dto.quantityOnHand).toBe(25);
      expect(dto.minimumStock).toBe(10);
      expect(dto.purchaseCostAmount).toBe(8.5);
      expect(dto.sellingPriceAmount).toBe(15.0);
      expect(dto.status).toBe(InventoryItemStatus.ACTIVE);

      // Verify persistence & movements
      const persisted = await repository.findById(dto.id);
      expect(persisted).not.toBeNull();
      expect(persisted!.movements).toHaveLength(1);
      expect(persisted!.movements[0]?.reason).toContain('Initial opening stock balance');

      // Verify event publishing
      expect(eventPublisher.publishedEvents).toHaveLength(1);
      expect(eventPublisher.publishedEvents[0]?.eventType).toBe('InventoryItemCreated');
    });

    it('rejects creation when required SKU or name is missing', async () => {
      const resNoSku = await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: '',
          name: 'Elastic Bandage',
          actorId: ACTOR_ID,
        }),
      );
      expect(resNoSku.isSuccess).toBe(false);
      expect(resNoSku.error).toContain('SKU is required');

      const resNoName = await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'BAND-01',
          name: '',
          actorId: ACTOR_ID,
        }),
      );
      expect(resNoName.isSuccess).toBe(false);
      expect(resNoName.error).toContain('Item name is required');
    });

    it('rejects creation with duplicate SKU in the same tenant', async () => {
      await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'TAPE-01',
          name: 'First Tape',
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
        }),
      );

      const duplicate = await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'tape-01', // case-insensitive duplicate
          name: 'Second Tape',
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
        }),
      );

      expect(duplicate.isSuccess).toBe(false);
      expect(duplicate.error).toContain('already exists');
    });

    it('rejects creation with invalid negative initial stock or invalid category', async () => {
      const invalidStock = await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'NEG-01',
          name: 'Negative Stock Item',
          initialStock: -5,
          actorId: ACTOR_ID,
        }),
      );
      expect(invalidStock.isSuccess).toBe(false);

      const invalidCat = await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'CAT-01',
          name: 'Invalid Category Item',
          category: 'INVALID_CATEGORY' as unknown as InventoryCategory,
          actorId: ACTOR_ID,
        }),
      );
      expect(invalidCat.isSuccess).toBe(false);
    });
  });

  describe('UpdateProduct (UpdateInventoryItemHandler)', () => {
    let existingItemId: string;

    beforeEach(async () => {
      const res = await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'MASSAGE-OIL-01',
          name: 'Arnica Massage Oil 500ml',
          category: InventoryCategory.CLINICAL_SUPPLIES,
          unit: UnitOfMeasure.BOTTLES,
          minimumStock: 5,
          initialStock: 0,
          purchaseCost: { amount: 12.0, currency: 'USD' },
          sellingPrice: { amount: 24.0, currency: 'USD' },
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
        }),
      );
      existingItemId = res.value.id;
    });

    it('updates mutable metadata fields successfully', async () => {
      const updateCmd = new UpdateInventoryItemCommand({
        id: existingItemId,
        name: 'Arnica Extra Strength Massage Oil 500ml',
        description: 'Enhanced organic arnica formulation',
        minimumStock: 8,
        sellingPrice: { amount: 28.5, currency: 'USD' },
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
      });

      const res = await updateHandler.execute(updateCmd);
      expect(res.isSuccess).toBe(true);
      expect(res.value.name).toBe('Arnica Extra Strength Massage Oil 500ml');
      expect(res.value.description).toBe('Enhanced organic arnica formulation');
      expect(res.value.minimumStock).toBe(8);
      expect(res.value.sellingPriceAmount).toBe(28.5);
      expect(res.value.version).toBe(2);
    });

    it('rejects unit of measure change when positive stock exists', async () => {
      // Create product with positive stock
      const createdWithStock = await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'UNIT-ITEM-01',
          name: 'Foam Roller',
          category: InventoryCategory.RETAIL_PRODUCTS,
          unit: UnitOfMeasure.UNITS,
          initialStock: 10,
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
        }),
      );

      const updateUnitCmd = new UpdateInventoryItemCommand({
        id: createdWithStock.value.id,
        unit: UnitOfMeasure.BOXES,
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
      });

      const res = await updateHandler.execute(updateUnitCmd);
      expect(res.isSuccess).toBe(false);
      expect(res.error).toContain(
        'Cannot change unit of measure for a product with positive stock on hand',
      );
    });

    it('allows unit of measure change when stock is zero and no movements exist', async () => {
      const updateUnitCmd = new UpdateInventoryItemCommand({
        id: existingItemId,
        unit: UnitOfMeasure.MILLILITERS,
        tenantId: TENANT_ID,
        actorId: ACTOR_ID,
      });

      const res = await updateHandler.execute(updateUnitCmd);
      expect(res.isSuccess).toBe(true);
      expect(res.value.unit).toBe(UnitOfMeasure.MILLILITERS);
    });

    it('rejects updates on archived items', async () => {
      await archiveHandler.execute(
        new ArchiveInventoryItemCommand({
          id: existingItemId,
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
        }),
      );

      const updateArchived = await updateHandler.execute(
        new UpdateInventoryItemCommand({
          id: existingItemId,
          name: 'Should Fail Name',
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
        }),
      );

      expect(updateArchived.isSuccess).toBe(false);
      expect(updateArchived.error).toContain('archived');
    });

    it('rejects cross-tenant updates', async () => {
      const crossTenant = await updateHandler.execute(
        new UpdateInventoryItemCommand({
          id: existingItemId,
          name: 'Hacked Name',
          tenantId: 'other_tenant',
          actorId: ACTOR_ID,
        }),
      );

      expect(crossTenant.isSuccess).toBe(false);
      expect(crossTenant.error).toContain('Cross-tenant');
    });
  });

  describe('GetProduct (GetInventoryItemByIdHandler)', () => {
    let activeItemId: string;
    let archivedItemId: string;

    beforeEach(async () => {
      const res1 = await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'GET-ACTIVE-01',
          name: 'Active Bandage',
          initialStock: 10,
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
        }),
      );
      activeItemId = res1.value.id;

      const res2 = await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'GET-ARCHIVED-01',
          name: 'Discontinued Splint',
          initialStock: 0,
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
        }),
      );
      archivedItemId = res2.value.id;
      await archiveHandler.execute(
        new ArchiveInventoryItemCommand({
          id: archivedItemId,
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
        }),
      );
    });

    it('retrieves an active product by ID', async () => {
      const query = new GetInventoryItemByIdQuery({
        id: activeItemId,
        tenantId: TENANT_ID,
      });

      const res = await getByIdHandler.execute(query);
      expect(res.isSuccess).toBe(true);
      expect(res.value.sku).toBe('GET-ACTIVE-01');
    });

    it('returns error when product is not found', async () => {
      const query = new GetInventoryItemByIdQuery({
        id: 'non_existent_id',
        tenantId: TENANT_ID,
      });

      const res = await getByIdHandler.execute(query);
      expect(res.isSuccess).toBe(false);
      expect(res.error).toContain('not found');
    });

    it('hides archived product when includeArchived is false or omitted', async () => {
      const query = new GetInventoryItemByIdQuery({
        id: archivedItemId,
        tenantId: TENANT_ID,
        includeArchived: false,
      });

      const res = await getByIdHandler.execute(query);
      expect(res.isSuccess).toBe(false);
      expect(res.error).toContain('archived');
    });

    it('returns archived product when includeArchived is true', async () => {
      const query = new GetInventoryItemByIdQuery({
        id: archivedItemId,
        tenantId: TENANT_ID,
        includeArchived: true,
      });

      const res = await getByIdHandler.execute(query);
      expect(res.isSuccess).toBe(true);
      expect(res.value.id).toBe(archivedItemId);
      expect(res.value.status).toBe(InventoryItemStatus.ARCHIVED);
    });
  });

  describe('ListProducts (ListInventoryItemsHandler)', () => {
    beforeEach(async () => {
      // Seed diverse catalog items
      await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'CLIN-TAPE-01',
          name: 'Zinc Oxide Tape 38mm',
          description: 'White sports rigid tape',
          category: InventoryCategory.CLINICAL_SUPPLIES,
          initialStock: 30,
          minimumStock: 10,
          sellingPrice: { amount: 12.0, currency: 'USD' },
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
        }),
      );

      await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'CLIN-TAPE-02',
          name: 'Elastic Adhesive Tape 50mm',
          description: 'Heavy strapping tape',
          category: InventoryCategory.CLINICAL_SUPPLIES,
          initialStock: 4,
          minimumStock: 10, // LOW_STOCK
          sellingPrice: { amount: 16.0, currency: 'USD' },
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
        }),
      );

      await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'REHAB-BAND-01',
          name: 'Resistance Loop Green',
          category: InventoryCategory.THERAPY_CONSUMABLES,
          initialStock: 0, // OUT_OF_STOCK
          minimumStock: 5,
          sellingPrice: { amount: 8.0, currency: 'USD' },
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
        }),
      );

      const archivedItem = await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'OLD-SUPPLY-99',
          name: 'Old Discontinued Item',
          category: InventoryCategory.CLINICAL_SUPPLIES,
          initialStock: 0,
          minimumStock: 0,
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
        }),
      );
      await archiveHandler.execute(
        new ArchiveInventoryItemCommand({
          id: archivedItem.value.id,
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
        }),
      );
    });

    it('lists active/inactive products excluding archived by default', async () => {
      const res = await listHandler.execute(
        new ListInventoryItemsQuery({
          tenantId: TENANT_ID,
          filter: { page: 1, limit: 10 },
        }),
      );

      expect(res.isSuccess).toBe(true);
      expect(res.value.total).toBe(3); // 3 non-archived items
      expect(res.value.items).toHaveLength(3);
      expect(res.value.items.some((i: { sku: string }) => i.sku === 'OLD-SUPPLY-99')).toBe(false);
    });

    it('filters by search term (case-insensitive substring across name/sku/description)', async () => {
      const res = await listHandler.execute(
        new ListInventoryItemsQuery({
          tenantId: TENANT_ID,
          filter: { search: 'strapping' },
        }),
      );

      expect(res.isSuccess).toBe(true);
      expect(res.value.total).toBe(1);
      expect(res.value.items[0]?.sku).toBe('CLIN-TAPE-02');
    });

    it('filters by category', async () => {
      const res = await listHandler.execute(
        new ListInventoryItemsQuery({
          tenantId: TENANT_ID,
          filter: { category: InventoryCategory.THERAPY_CONSUMABLES },
        }),
      );

      expect(res.isSuccess).toBe(true);
      expect(res.value.total).toBe(1);
      expect(res.value.items[0]?.sku).toBe('REHAB-BAND-01');
    });

    it('filters by stockStatus (OUT_OF_STOCK vs LOW_STOCK vs IN_STOCK)', async () => {
      const outOfStockRes = await listHandler.execute(
        new ListInventoryItemsQuery({
          tenantId: TENANT_ID,
          filter: { stockStatus: 'OUT_OF_STOCK' },
        }),
      );
      expect(outOfStockRes.value.total).toBe(1);
      expect(outOfStockRes.value.items[0]?.sku).toBe('REHAB-BAND-01');

      const lowStockRes = await listHandler.execute(
        new ListInventoryItemsQuery({
          tenantId: TENANT_ID,
          filter: { stockStatus: 'LOW_STOCK' },
        }),
      );
      expect(lowStockRes.value.total).toBe(1);
      expect(lowStockRes.value.items[0]?.sku).toBe('CLIN-TAPE-02');

      const inStockRes = await listHandler.execute(
        new ListInventoryItemsQuery({
          tenantId: TENANT_ID,
          filter: { stockStatus: 'IN_STOCK' },
        }),
      );
      expect(inStockRes.value.total).toBe(1);
      expect(inStockRes.value.items[0]?.sku).toBe('CLIN-TAPE-01');
    });

    it('paginates results deterministically', async () => {
      const page1 = await listHandler.execute(
        new ListInventoryItemsQuery({
          tenantId: TENANT_ID,
          filter: { page: 1, limit: 2, sortBy: 'name', sortOrder: 'asc' },
        }),
      );
      expect(page1.value.items).toHaveLength(2);
      expect(page1.value.page).toBe(1);
      expect(page1.value.totalPages).toBe(2);
      expect(page1.value.hasNextPage).toBe(true);
      expect(page1.value.hasPreviousPage).toBe(false);

      const page2 = await listHandler.execute(
        new ListInventoryItemsQuery({
          tenantId: TENANT_ID,
          filter: { page: 2, limit: 2, sortBy: 'name', sortOrder: 'asc' },
        }),
      );
      expect(page2.value.items).toHaveLength(1);
      expect(page2.value.page).toBe(2);
      expect(page2.value.hasNextPage).toBe(false);
      expect(page2.value.hasPreviousPage).toBe(true);
    });

    it('includes archived items when includeArchived is true', async () => {
      const res = await listHandler.execute(
        new ListInventoryItemsQuery({
          tenantId: TENANT_ID,
          filter: { includeArchived: true },
        }),
      );

      expect(res.value.total).toBe(4);
      expect(res.value.items.some((i: { sku: string }) => i.sku === 'OLD-SUPPLY-99')).toBe(true);
    });
  });

  describe('ArchiveProduct & Lifecycle (Archive/Deactivate/Activate Handlers)', () => {
    let itemId: string;

    beforeEach(async () => {
      const res = await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'LIFECYCLE-01',
          name: 'Lifecycle Item',
          initialStock: 0,
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
        }),
      );
      itemId = res.value.id;
    });

    it('archives product with zero stock successfully', async () => {
      const res = await archiveHandler.execute(
        new ArchiveInventoryItemCommand({
          id: itemId,
          reason: 'End of product lifecycle',
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
        }),
      );

      expect(res.isSuccess).toBe(true);
      expect(res.value.status).toBe(InventoryItemStatus.ARCHIVED);

      const item = await repository.findById(itemId);
      expect(item!.status).toBe(InventoryItemStatus.ARCHIVED);
    });

    it('rejects archival when positive stock exists', async () => {
      const withStock = await createHandler.execute(
        new CreateInventoryItemCommand({
          sku: 'STOCK-ARCHIVE-01',
          name: 'Item With Stock',
          initialStock: 15,
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
        }),
      );

      const res = await archiveHandler.execute(
        new ArchiveInventoryItemCommand({
          id: withStock.value.id,
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
        }),
      );

      expect(res.isSuccess).toBe(false);
      expect(res.error).toContain('Cannot archive an inventory item with remaining stock');
    });

    it('handles deactivation and reactivation transitions', async () => {
      // Deactivate
      const deactRes = await deactivateHandler.execute(
        new DeactivateInventoryItemCommand({
          id: itemId,
          reason: 'Supplier stock shortage',
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
        }),
      );
      expect(deactRes.isSuccess).toBe(true);
      expect(deactRes.value.status).toBe(InventoryItemStatus.INACTIVE);

      // Re-activate
      const actRes = await activateHandler.execute(
        new ActivateInventoryItemCommand({
          id: itemId,
          tenantId: TENANT_ID,
          actorId: ACTOR_ID,
        }),
      );
      expect(actRes.isSuccess).toBe(true);
      expect(actRes.value.status).toBe(InventoryItemStatus.ACTIVE);
    });
  });
});
