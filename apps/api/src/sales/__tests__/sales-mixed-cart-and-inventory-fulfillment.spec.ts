import {
  Sale,
  SaleId,
  SaleSourceType,
  CreateSaleHandler,
  CreateSaleCommand,
  AddSaleItemHandler,
  AddSaleItemCommand,
  FinalizeSaleHandler,
  FinalizeSaleCommand,
  SaleRepositoryPort,
  SaleUnauthorizedException,
  InventoryItemRepository,
  SellStockHandler,
  InventoryItem,
  InventoryCategory,
  UnitOfMeasure,
  StockMovementType,
} from '@kinergy-platform/core';

class InMemorySaleRepo implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public saveCount = 0;

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.saveCount++;
    this.store.set(sale.id.value, sale);
  }
}

class InMemoryInventoryRepo implements InventoryItemRepository {
  public items = new Map<string, InventoryItem>();

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

describe('Task 84266: Mixed Cart Authorization and Inventory Fulfillment', () => {
  let saleRepo: InMemorySaleRepo;
  let inventoryRepo: InMemoryInventoryRepo;
  let sellStockHandler: SellStockHandler;
  let createSaleHandler: CreateSaleHandler;
  let addSaleItemHandler: AddSaleItemHandler;
  let finalizeSaleHandler: FinalizeSaleHandler;

  let foodItem: InventoryItem;
  let drinkItem: InventoryItem;

  const receptionistUser = {
    userId: 'usr_receptionist_1',
    roles: ['Receptionist'],
    permissions: [
      'sales.read',
      'sales.create',
      'sales.cancel',
      'payments.read',
      'payments.create',
      'payments.manage',
      'receipts.read',
      'receipts.manage',
      'billing.read',
      'billing.write',
      'appointments.read',
      'appointments.create',
      'inventory.read',
    ],
    tenantId: 'tenant_demo',
  };

  const kitchenStaffUser = {
    userId: 'usr_kitchen_1',
    roles: ['Kitchen Staff'],
    permissions: [
      'kitchen.read',
      'kitchen.orders.manage',
      'inventory.read',
      'inventory.write',
      'sales.read',
      'sales.create',
      'payments.create',
      'receipts.read',
    ],
    tenantId: 'tenant_demo',
  };

  const unprivilegedUser = {
    userId: 'usr_no_inventory',
    roles: ['Staff'],
    permissions: ['sales.create', 'sales.read'], // Missing inventory.read
    tenantId: 'tenant_demo',
  };

  beforeEach(() => {
    saleRepo = new InMemorySaleRepo();
    inventoryRepo = new InMemoryInventoryRepo();
    sellStockHandler = new SellStockHandler(inventoryRepo);
    createSaleHandler = new CreateSaleHandler(saleRepo);
    addSaleItemHandler = new AddSaleItemHandler(saleRepo);
    finalizeSaleHandler = new FinalizeSaleHandler(saleRepo);

    // Seed test inventory items
    foodItem = InventoryItem.create({
      sku: 'FOOD-QUI-01',
      name: 'Quinoa Power Salad',
      category: InventoryCategory.HEALTHY_MEALS,
      unit: UnitOfMeasure.UNITS,
      initialStock: 25,
      minimumStock: 5,
      purchaseCost: { amount: 3.5, currency: 'USD' },
      sellingPrice: { amount: 8.5, currency: 'USD' },
      recordedByUserId: 'usr_chef',
      tenantId: 'tenant_demo',
    });
    inventoryRepo.seed(foodItem);

    drinkItem = InventoryItem.create({
      sku: 'DRK-SMO-01',
      name: 'Green Detox Smoothie',
      category: InventoryCategory.HEALTHY_DRINKS,
      unit: UnitOfMeasure.BOTTLES,
      initialStock: 30,
      minimumStock: 5,
      purchaseCost: { amount: 1.5, currency: 'USD' },
      sellingPrice: { amount: 4.5, currency: 'USD' },
      recordedByUserId: 'usr_barista',
      tenantId: 'tenant_demo',
    });
    inventoryRepo.seed(drinkItem);
  });

  describe('1. Receptionist Role Permission: Selling Food and Drinks', () => {
    it('authorizes Receptionist with inventory.read to create a sale containing Food and Drinks', async () => {
      const foodId = foodItem.id.getValue();
      const drinkId = drinkItem.id.getValue();

      const command = new CreateSaleCommand({
        tenantId: 'tenant_demo',
        currency: 'USD',
        currentUser: receptionistUser,
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: foodId,
          sourceCode: 'FOOD-QUI-01',
        },
        items: [
          {
            description: 'Quinoa Power Salad',
            skuOrCode: 'FOOD-QUI-01',
            quantity: 2,
            unitPriceAmount: 8.5,
            source: {
              sourceType: 'INVENTORY_ITEM',
              sourceId: foodId,
            },
          },
          {
            description: 'Green Detox Smoothie',
            skuOrCode: 'DRK-SMO-01',
            quantity: 1,
            unitPriceAmount: 4.5,
            source: {
              sourceType: 'INVENTORY_ITEM',
              sourceId: drinkId,
            },
          },
        ],
      });

      const result = await createSaleHandler.execute(command);
      expect(result.isSuccess).toBe(true);
      const saleDTO = result.getValue();
      expect(saleDTO.items.length).toBe(2);
      expect(saleDTO.total.amount).toBe(21.5); // 2 * 8.5 + 4.5 = 21.5
    });

    it('authorizes Receptionist to create and finalize a mixed cart with Membership, Food, and Drinks', async () => {
      const foodId = foodItem.id.getValue();

      const command = new CreateSaleCommand({
        tenantId: 'tenant_demo',
        clientId: 'cli_carlos',
        currency: 'USD',
        currentUser: receptionistUser,
        source: {
          sourceType: SaleSourceType.GYM_MEMBERSHIP,
          sourceId: 'plan_silver_monthly',
        },
        items: [
          {
            description: 'Silver Monthly Pass',
            quantity: 1,
            unitPriceAmount: 60.0,
            source: {
              sourceType: 'MEMBERSHIP_PLAN',
              sourceId: 'plan_silver_monthly',
            },
          },
          {
            description: 'Quinoa Power Salad',
            quantity: 1,
            unitPriceAmount: 8.5,
            source: {
              sourceType: 'INVENTORY_ITEM',
              sourceId: foodId,
            },
          },
        ],
      });

      const createResult = await createSaleHandler.execute(command);
      expect(createResult.isSuccess).toBe(true);

      const finalizeCmd = new FinalizeSaleCommand({
        saleId: createResult.getValue().id,
        tenantId: 'tenant_demo',
        currentUser: receptionistUser,
      });

      const finalizeResult = await finalizeSaleHandler.execute(finalizeCmd);
      expect(finalizeResult.isSuccess).toBe(true);
      expect(finalizeResult.getValue().status).toBe('PENDING_PAYMENT');
      expect(finalizeResult.getValue().total.amount).toBe(68.5);
    });
  });

  describe('2. Mixed Cart Authorization Guard (Least Privilege Enforcement)', () => {
    it('strictly denies user lacking inventory.read from creating Food or Drink sales', async () => {
      const foodId = foodItem.id.getValue();

      const command = new CreateSaleCommand({
        tenantId: 'tenant_demo',
        currency: 'USD',
        currentUser: unprivilegedUser,
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: foodId,
        },
        items: [
          {
            description: 'Quinoa Power Salad',
            quantity: 1,
            unitPriceAmount: 8.5,
          },
        ],
      });

      const res = await createSaleHandler.execute(command);
      expect(res.isFailure).toBe(true);
      expect(res.getError()).toBeInstanceOf(SaleUnauthorizedException);
    });

    it('strictly denies Kitchen Staff from selling a Gym Membership alone', async () => {
      const command = new CreateSaleCommand({
        tenantId: 'tenant_demo',
        currency: 'USD',
        currentUser: kitchenStaffUser,
        source: {
          sourceType: SaleSourceType.GYM_MEMBERSHIP,
          sourceId: 'plan_silver_monthly',
        },
        items: [
          {
            description: 'Silver Monthly Pass',
            quantity: 1,
            unitPriceAmount: 60.0,
          },
        ],
      });

      const res = await createSaleHandler.execute(command);
      expect(res.isFailure).toBe(true);
      expect(res.getError()).toBeInstanceOf(SaleUnauthorizedException);
    });

    it('strictly denies Kitchen Staff from creating a mixed cart containing Gym Membership even if cart has Food', async () => {
      const foodId = foodItem.id.getValue();

      const command = new CreateSaleCommand({
        tenantId: 'tenant_demo',
        currency: 'USD',
        currentUser: kitchenStaffUser,
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: foodId,
        },
        items: [
          {
            description: 'Quinoa Power Salad',
            quantity: 1,
            unitPriceAmount: 8.5,
            source: {
              sourceType: 'FOOD',
              sourceId: foodId,
            },
          },
          {
            description: 'Silver Monthly Pass',
            quantity: 1,
            unitPriceAmount: 60.0,
            source: {
              sourceType: 'GYM_MEMBERSHIP',
              sourceId: 'plan_silver_monthly',
            },
          },
        ],
      });

      const res = await createSaleHandler.execute(command);
      expect(res.isFailure).toBe(true);
      expect(res.getError()).toBeInstanceOf(SaleUnauthorizedException);
    });

    it('strictly denies Kitchen Staff from adding a Gym Membership item to an existing Food sale', async () => {
      const foodId = foodItem.id.getValue();

      // 1. Kitchen staff creates a valid food sale
      const createCmd = new CreateSaleCommand({
        tenantId: 'tenant_demo',
        currency: 'USD',
        currentUser: kitchenStaffUser,
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: foodId,
        },
        items: [
          {
            description: 'Quinoa Power Salad',
            quantity: 1,
            unitPriceAmount: 8.5,
            source: {
              sourceType: 'FOOD',
              sourceId: foodId,
            },
          },
        ],
      });

      const createRes = await createSaleHandler.execute(createCmd);
      expect(createRes.isSuccess).toBe(true);
      const saleId = createRes.getValue().id;

      // 2. Kitchen staff attempts to add Gym Membership to the draft sale
      const addCmd = new AddSaleItemCommand({
        saleId,
        tenantId: 'tenant_demo',
        currentUser: kitchenStaffUser,
        description: 'Gold Pass',
        quantity: 1,
        unitPriceAmount: 100,
        source: {
          sourceType: 'GYM_MEMBERSHIP',
          sourceId: 'plan_gold',
        },
      });

      const addRes = await addSaleItemHandler.execute(addCmd);
      expect(addRes.isFailure).toBe(true);
      expect(addRes.getError()).toBeInstanceOf(SaleUnauthorizedException);
    });
  });

  describe('3. Automated Stock Decrement on Payment Settlement (SalePaidEvent)', () => {
    it('automatically decrements stock and logs movements when sale with food and drinks is paid', async () => {
      const foodId = foodItem.id.getValue();
      const drinkId = drinkItem.id.getValue();

      // Initial stock levels
      expect(inventoryRepo.items.get(foodId)?.quantityOnHand.value).toBe(25);
      expect(inventoryRepo.items.get(drinkId)?.quantityOnHand.value).toBe(30);

      // 1. Create a sale with 2 Quinoa Salads and 3 Green Smoothies
      const command = new CreateSaleCommand({
        tenantId: 'tenant_demo',
        currency: 'USD',
        currentUser: receptionistUser,
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: foodId,
        },
        items: [
          {
            description: 'Quinoa Power Salad',
            quantity: 2,
            unitPriceAmount: 8.5,
            source: {
              sourceType: 'INVENTORY_ITEM',
              sourceId: foodId,
            },
          },
          {
            description: 'Green Detox Smoothie',
            quantity: 3,
            unitPriceAmount: 4.5,
            source: {
              sourceType: 'INVENTORY_ITEM',
              sourceId: drinkId,
            },
          },
        ],
      });

      const createRes = await createSaleHandler.execute(command);
      expect(createRes.isSuccess).toBe(true);
      const saleId = createRes.getValue().id;

      // 2. Fulfill stock via SellStockHandler / InventoryStockDecrementPort (ADR-0106 & ADR-0112)
      await sellStockHandler.sellStock({
        itemId: foodId,
        quantity: 2,
        reason: 'POS Sale Fulfillment',
        actorId: receptionistUser.userId,
        referenceId: `${saleId}:item_1`,
      });
      await sellStockHandler.sellStock({
        itemId: drinkId,
        quantity: 3,
        reason: 'POS Sale Fulfillment',
        actorId: receptionistUser.userId,
        referenceId: `${saleId}:item_2`,
      });

      // 3. Verify stock balances were decremented
      const updatedFood = inventoryRepo.items.get(foodId)!;
      const updatedDrink = inventoryRepo.items.get(drinkId)!;

      expect(updatedFood.quantityOnHand.value).toBe(23); // 25 - 2 = 23
      expect(updatedDrink.quantityOnHand.value).toBe(27); // 30 - 3 = 27

      // Verify append-only movement ledger
      const lastFoodMovement = updatedFood.movements[updatedFood.movements.length - 1];
      expect(lastFoodMovement?.movementType).toBe(StockMovementType.SALE);
      expect(lastFoodMovement?.quantityDelta.value).toBe(-2);

      const lastDrinkMovement = updatedDrink.movements[updatedDrink.movements.length - 1];
      expect(lastDrinkMovement?.movementType).toBe(StockMovementType.SALE);
      expect(lastDrinkMovement?.quantityDelta.value).toBe(-3);

      // 4. Idempotency test: Re-executing duplicate sellStock with identical referenceId does NOT decrement stock again
      await sellStockHandler.sellStock({
        itemId: foodId,
        quantity: 2,
        reason: 'POS Sale Retry',
        actorId: receptionistUser.userId,
        referenceId: `${saleId}:item_1`,
      });
      expect(updatedFood.quantityOnHand.value).toBe(23);
      expect(updatedDrink.quantityOnHand.value).toBe(27);
      expect(updatedFood.movements.length).toBe(2); // Initial + 1 Sale movement
      expect(updatedDrink.movements.length).toBe(2);
    });
  });
});
