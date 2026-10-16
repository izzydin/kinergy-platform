import { InventoryItem } from '../../domain/inventory/inventory-item.aggregate';
import { InventoryCategory } from '../../domain/inventory/enums/inventory-category.enum';
import { UnitOfMeasure } from '../../domain/inventory/enums/unit-of-measure.enum';
import { StockMovementType } from '../../domain/inventory/enums/stock-movement-type.enum';
import { InventoryItemRepository } from '../../domain/inventory/repositories/inventory-item.repository.interface';
import { SellStockHandler } from '../handlers/sell-stock.handler';
import { GetInventoryItemByIdHandler } from '../handlers/get-inventory-item-by-id.handler';
import { GetInventoryItemByIdQuery } from '../queries/get-inventory-item-by-id.query';
import { InventoryStockDecrementPort } from '../ports/inventory-stock-decrement.port';

class MockInventoryRepository implements InventoryItemRepository {
  private items = new Map<string, InventoryItem>();

  async findById(id: string): Promise<InventoryItem | null> {
    return this.items.get(id) ?? null;
  }

  async findBySku(sku: string, tenantId?: string): Promise<InventoryItem | null> {
    for (const item of this.items.values()) {
      if (
        item.sku.value === sku.trim().toUpperCase() &&
        (!tenantId || item.tenantId === tenantId)
      ) {
        return item;
      }
    }
    return null;
  }

  async save(item: InventoryItem): Promise<void> {
    this.items.set(item.id.getValue(), item);
  }

  async findMany(): Promise<InventoryItem[]> {
    return Array.from(this.items.values());
  }

  async count(): Promise<number> {
    return this.items.size;
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }

  seed(item: InventoryItem): void {
    this.items.set(item.id.getValue(), item);
  }
}

describe('Resources Food & Drink Commercial Sales Integration (Prompt 7C)', () => {
  let repository: MockInventoryRepository;
  let decrementPort: InventoryStockDecrementPort;
  let getByIdHandler: GetInventoryItemByIdHandler;

  let foodItem: InventoryItem;
  let drinkItem: InventoryItem;
  let supplyItem: InventoryItem;

  const TENANT_ID = 'tenant_kinergy_main';
  const CASHIER_USER_ID = 'usr_cashier_reception';

  beforeEach(() => {
    repository = new MockInventoryRepository();
    decrementPort = new SellStockHandler(repository);
    getByIdHandler = new GetInventoryItemByIdHandler(repository);

    // 1. Food Consumable (Healthy Meal)
    foodItem = InventoryItem.create({
      sku: 'MEAL-SALAD-CHIK',
      name: 'Organic Grilled Chicken Quinoa Salad',
      category: InventoryCategory.HEALTHY_MEALS,
      unit: UnitOfMeasure.UNITS,
      initialStock: 20,
      minimumStock: 5,
      purchaseCost: { amount: 4.5, currency: 'USD' },
      sellingPrice: { amount: 11.5, currency: 'USD' },
      recordedByUserId: 'usr_chef_kitchen',
      tenantId: TENANT_ID,
    });

    // 2. Drink Consumable (Healthy Drink)
    drinkItem = InventoryItem.create({
      sku: 'DRINK-SMOOTHIE-GRE',
      name: 'Cold-Pressed Green Detox Smoothie 500ml',
      category: InventoryCategory.HEALTHY_DRINKS,
      unit: UnitOfMeasure.BOTTLES,
      initialStock: 15,
      minimumStock: 3,
      purchaseCost: { amount: 2.0, currency: 'USD' },
      sellingPrice: { amount: 6.0, currency: 'USD' },
      recordedByUserId: 'usr_barista',
      tenantId: TENANT_ID,
    });

    // 3. Operational Supply (Non-Retail Consumable)
    supplyItem = InventoryItem.create({
      sku: 'SUPPLY-DISINFECT-SPRAY',
      name: 'Hospital-Grade Disinfectant Spray',
      category: InventoryCategory.CLEANING_SUPPLIES,
      unit: UnitOfMeasure.BOTTLES,
      initialStock: 10,
      minimumStock: 2,
      purchaseCost: { amount: 3.0, currency: 'USD' },
      sellingPrice: { amount: 0.0, currency: 'USD' },
      recordedByUserId: 'usr_facility_mgr',
      tenantId: TENANT_ID,
    });

    repository.seed(foodItem);
    repository.seed(drinkItem);
    repository.seed(supplyItem);
  });

  describe('1. Classification & Retail Eligibility Taxonomy', () => {
    it('correctly classifies food products as HEALTHY_MEALS with retail eligibility', () => {
      expect(foodItem.category).toBe(InventoryCategory.HEALTHY_MEALS);
      expect(foodItem.isFood()).toBe(true);
      expect(foodItem.isDrink()).toBe(false);
      expect(foodItem.isRetailEligible()).toBe(true);
      expect(foodItem.isPerishable()).toBe(true);
    });

    it('correctly classifies drink products as HEALTHY_DRINKS with retail eligibility', () => {
      expect(drinkItem.category).toBe(InventoryCategory.HEALTHY_DRINKS);
      expect(drinkItem.isDrink()).toBe(true);
      expect(drinkItem.isFood()).toBe(false);
      expect(drinkItem.isRetailEligible()).toBe(true);
      expect(drinkItem.isPerishable()).toBe(true);
    });

    it('identifies operational supplies as non-retail eligible', () => {
      expect(supplyItem.category).toBe(InventoryCategory.CLEANING_SUPPLIES);
      expect(supplyItem.isFood()).toBe(false);
      expect(supplyItem.isDrink()).toBe(false);
      expect(supplyItem.isRetailEligible()).toBe(false);
      expect(supplyItem.isPerishable()).toBe(false);
    });
  });

  describe('2. Authoritative Price, Currency & Availability Resolution', () => {
    it('authoritatively resolves price and currency through GetInventoryItemByIdHandler', async () => {
      const query = new GetInventoryItemByIdQuery({
        id: foodItem.id.getValue(),
        tenantId: TENANT_ID,
      });

      const result = await getByIdHandler.execute(query);

      expect(result.isSuccess).toBe(true);
      const dto = result.value;
      expect(dto.name).toBe('Organic Grilled Chicken Quinoa Salad');
      expect(dto.sellingPriceAmount).toBe(11.5);
      expect(dto.sellingPriceCurrency).toBe('USD');
      expect(dto.quantityOnHand).toBe(20);
      expect(dto.status).toBe('ACTIVE');
      expect(dto.category).toBe('HEALTHY_MEALS');
    });

    it('fails resolution when querying with cross-tenant context', async () => {
      const query = new GetInventoryItemByIdQuery({
        id: foodItem.id.getValue(),
        tenantId: 'tenant_foreign_intruder',
      });

      const result = await getByIdHandler.execute(query);

      expect(result.isSuccess).toBe(false);
      expect(result.error).toMatch(/not found/i);
    });
  });

  describe('3. Valid Commercial Sale & Stock Deduction Lifecycle', () => {
    it('successfully fulfills food sale, deducting stock and creating append-only SALE movement', async () => {
      const commercialSaleId = 'sale_pos_2026_001';
      const commercialLineId = 'sale_item_line_001';

      const result = await decrementPort.sellStock({
        itemId: foodItem.id.getValue(),
        quantity: 2,
        referenceId: commercialSaleId,
        reason: `Front Desk POS Checkout (Line ${commercialLineId})`,
        actorId: CASHIER_USER_ID,
        tenantId: TENANT_ID,
        sellingPrice: { amount: 11.5, currency: 'USD' },
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.item.quantityOnHand).toBe(18); // 20 - 2
      expect(result.value.movement.movementType).toBe(StockMovementType.SALE);
      expect(result.value.movement.quantityDelta).toBe(-2);
      expect(result.value.movement.balanceAfter).toBe(18);
      expect(result.value.movement.referenceId).toBe(commercialSaleId);

      // Verify persisted state
      const persisted = await repository.findById(foodItem.id.getValue());
      expect(persisted?.quantityOnHand.value).toBe(18);
      expect(persisted?.movements.length).toBe(2); // initial + sale
    });

    it('successfully fulfills drink sale, updating stock and movements ledger', async () => {
      const commercialSaleId = 'sale_pos_2026_002';

      const result = await decrementPort.sellStock({
        itemId: drinkItem.id.getValue(),
        quantity: 3,
        referenceId: commercialSaleId,
        reason: 'Bar POS smoothie purchase',
        actorId: CASHIER_USER_ID,
        tenantId: TENANT_ID,
        sellingPrice: { amount: 6.0, currency: 'USD' },
      });

      expect(result.isSuccess).toBe(true);
      expect(result.value.item.quantityOnHand).toBe(12); // 15 - 3
      expect(result.value.movement.movementType).toBe(StockMovementType.SALE);
      expect(result.value.movement.quantityDelta).toBe(-3);
      expect(result.value.movement.balanceAfter).toBe(12);

      const persisted = await repository.findById(drinkItem.id.getValue());
      expect(persisted?.quantityOnHand.value).toBe(12);
    });
  });

  describe('4. Missing Product or Transaction Failure Handling', () => {
    it('rejects stock deduction for non-existent product ID', async () => {
      const result = await decrementPort.sellStock({
        itemId: 'inv_item_does_not_exist',
        quantity: 1,
        referenceId: 'sale_999',
        reason: 'Retail sale',
        actorId: CASHIER_USER_ID,
        tenantId: TENANT_ID,
      });

      expect(result.isSuccess).toBe(false);
      expect(result.error).toMatch(/not found/i);
    });

    it('rejects stock deduction when item ID is empty or whitespace', async () => {
      const result = await decrementPort.sellStock({
        itemId: '   ',
        quantity: 1,
        referenceId: 'sale_999',
        reason: 'Retail sale',
        actorId: CASHIER_USER_ID,
        tenantId: TENANT_ID,
      });

      expect(result.isSuccess).toBe(false);
      expect(result.error).toMatch(/item id is required/i);
    });
  });

  describe('5. Zero Negative Stock Invariant & Defect Defense', () => {
    it('strictly forbids sales exceeding stock on hand, preserving balance and version', async () => {
      const initialStock = drinkItem.quantityOnHand.value; // 15
      const initialVersion = drinkItem.version;
      const initialMovements = drinkItem.movements.length;

      const result = await decrementPort.sellStock({
        itemId: drinkItem.id.getValue(),
        quantity: 20, // Exceeds 15
        referenceId: 'sale_oversell_attempt',
        reason: 'Attempted bulk purchase',
        actorId: CASHIER_USER_ID,
        tenantId: TENANT_ID,
      });

      expect(result.isSuccess).toBe(false);
      expect(result.error).toMatch(/insufficient stock/i);

      // Verify zero side-effects
      const persisted = await repository.findById(drinkItem.id.getValue());
      expect(persisted?.quantityOnHand.value).toBe(initialStock);
      expect(persisted?.version).toBe(initialVersion);
      expect(persisted?.movements.length).toBe(initialMovements);
    });

    it('rejects sales of INACTIVE inventory items', async () => {
      drinkItem.deactivate(CASHIER_USER_ID, 'Seasonal freeze');
      await repository.save(drinkItem);

      const result = await decrementPort.sellStock({
        itemId: drinkItem.id.getValue(),
        quantity: 1,
        referenceId: 'sale_inactive_attempt',
        reason: 'Attempted sale of inactive item',
        actorId: CASHIER_USER_ID,
        tenantId: TENANT_ID,
      });

      expect(result.isSuccess).toBe(false);
      expect(result.error).toMatch(/inactive/i);
    });
  });

  describe('6. Idempotent Retry & Anti-Duplication Defense', () => {
    it('returns existing StockMovement and avoids duplicate stock deduction on retried request', async () => {
      const commercialSaleId = 'sale_tx_idempotent_1001';

      // 1. Initial valid sale
      const firstResult = await decrementPort.sellStock({
        itemId: foodItem.id.getValue(),
        quantity: 4,
        referenceId: commercialSaleId,
        reason: 'First checkout attempt',
        actorId: CASHIER_USER_ID,
        tenantId: TENANT_ID,
      });

      expect(firstResult.isSuccess).toBe(true);
      expect(firstResult.value.item.quantityOnHand).toBe(16); // 20 - 4
      const firstMovementId = firstResult.value.movement.id;
      const initialMovementsCount = (await repository.findById(foodItem.id.getValue()))!.movements
        .length;

      // 2. Exact repeated request (network retry / webhook re-delivery)
      const secondResult = await decrementPort.sellStock({
        itemId: foodItem.id.getValue(),
        quantity: 4,
        referenceId: commercialSaleId,
        reason: 'Retried checkout attempt',
        actorId: CASHIER_USER_ID,
        tenantId: TENANT_ID,
      });

      expect(secondResult.isSuccess).toBe(true);
      // Critical Invariant: Stock remains 16, NOT 12!
      expect(secondResult.value.item.quantityOnHand).toBe(16);
      expect(secondResult.value.movement.id).toBe(firstMovementId);
      expect(secondResult.value.movement.balanceAfter).toBe(16);

      // Verify repository ledger has NO duplicate movements
      const persisted = await repository.findById(foodItem.id.getValue());
      expect(persisted?.quantityOnHand.value).toBe(16);
      expect(persisted?.movements.length).toBe(initialMovementsCount);
    });

    it('rejects retried request with conflicting quantity under identical referenceId', async () => {
      const commercialSaleId = 'sale_tx_conflict_2002';

      // Initial sale: 2 units
      const firstResult = await decrementPort.sellStock({
        itemId: foodItem.id.getValue(),
        quantity: 2,
        referenceId: commercialSaleId,
        reason: 'Original checkout',
        actorId: CASHIER_USER_ID,
        tenantId: TENANT_ID,
      });
      expect(firstResult.isSuccess).toBe(true);

      // Mutate params: pass referenceId directly into aggregate
      const loaded = await repository.findById(foodItem.id.getValue());
      expect(() => {
        loaded?.sellStock({
          quantity: 5, // Conflicting quantity (was 2)
          referenceId: commercialSaleId,
          reason: 'Conflicting retry',
          actorId: CASHIER_USER_ID,
        });
      }).toThrow(/idempotency conflict/i);
    });
  });

  describe('7. End-to-End Coordinated Commercial Sales Simulation', () => {
    it('simulates end-to-end POS multi-item checkout, settlement, and stock verification', async () => {
      // Step 1: Front Desk Cashier looks up food and drink prices
      const foodQuery = new GetInventoryItemByIdQuery({
        id: foodItem.id.getValue(),
        tenantId: TENANT_ID,
      });
      const drinkQuery = new GetInventoryItemByIdQuery({
        id: drinkItem.id.getValue(),
        tenantId: TENANT_ID,
      });

      const [foodRes, drinkRes] = await Promise.all([
        getByIdHandler.execute(foodQuery),
        getByIdHandler.execute(drinkQuery),
      ]);

      expect(foodRes.isSuccess).toBe(true);
      expect(drinkRes.isSuccess).toBe(true);

      // Step 2: Commercial Sale Agreement formed in Sales boundary
      const commercialSaleId = 'sale_pos_complete_order_44';
      const expectedTotalAmount =
        foodRes.value.sellingPriceAmount * 2 + drinkRes.value.sellingPriceAmount * 1; // 11.5*2 + 6*1 = 29.0
      expect(expectedTotalAmount).toBe(29.0);

      // Step 3: Payment settled -> Fulfillment invoked for each line item sequentially
      const foodFulfillment = await decrementPort.sellStock({
        itemId: foodItem.id.getValue(),
        quantity: 2,
        referenceId: `${commercialSaleId}:item_food_1`,
        reason: `Settled checkout ${commercialSaleId}`,
        actorId: CASHIER_USER_ID,
        tenantId: TENANT_ID,
      });

      const drinkFulfillment = await decrementPort.sellStock({
        itemId: drinkItem.id.getValue(),
        quantity: 1,
        referenceId: `${commercialSaleId}:item_drink_1`,
        reason: `Settled checkout ${commercialSaleId}`,
        actorId: CASHIER_USER_ID,
        tenantId: TENANT_ID,
      });

      expect(foodFulfillment.isSuccess).toBe(true);
      expect(drinkFulfillment.isSuccess).toBe(true);

      // Step 4: Verify stock outcomes together
      const updatedFood = await repository.findById(foodItem.id.getValue());
      const updatedDrink = await repository.findById(drinkItem.id.getValue());

      expect(updatedFood?.quantityOnHand.value).toBe(18); // 20 - 2
      expect(updatedDrink?.quantityOnHand.value).toBe(14); // 15 - 1

      // Step 5: Verify ledger correlation
      const foodSaleMovement = updatedFood?.movements.find(
        (m) => m.referenceId === `${commercialSaleId}:item_food_1`,
      );
      const drinkSaleMovement = updatedDrink?.movements.find(
        (m) => m.referenceId === `${commercialSaleId}:item_drink_1`,
      );

      expect(foodSaleMovement).toBeDefined();
      expect(foodSaleMovement?.quantityDelta.value).toBe(-2);
      expect(drinkSaleMovement).toBeDefined();
      expect(drinkSaleMovement?.quantityDelta.value).toBe(-1);
    });
  });
});
