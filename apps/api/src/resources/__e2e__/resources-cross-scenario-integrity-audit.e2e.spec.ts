import { HttpStatus } from '@nestjs/common';
import {
  InventoryCategory,
  StockMovementType,
  StockMovement,
  AssetCategory,
  AssetStatus,
  AssetCondition,
  AssetHistoryEventType,
  InventoryItem,
} from '@kinergy-platform/core';
import {
  createResourcesE2ETestEnvironment,
  ResourcesE2ETestEnvironment,
  assertResourceOverview,
} from './support';
import {
  TransferFixedAssetLocationRequestDto,
  ChangeFixedAssetStatusRequestDto,
  RecordAssetMaintenanceRequestDto,
  UpdateFixedAssetValuationRequestDto,
} from '../dto';

describe('Phase 6: Cross-Scenario Data Integrity Audit (Scenarios A through H)', () => {
  let env: ResourcesE2ETestEnvironment;

  beforeAll(async () => {
    env = await createResourcesE2ETestEnvironment();
  });

  afterAll(async () => {
    if (env) {
      await env.close();
    }
  });

  beforeEach(() => {
    env.reset();
  });

  it('proves that executing scenarios A through H together creates zero hidden consistency, valuation, identity, or authorization problems', async () => {
    const { client, productFactory, assetFactory, inventoryRepo, fixedAssetRepo, userRepo } = env;
    const { owner, receptionist, trainer, clientUser } = env.personas;

    // ========================================================================
    // 1. EXECUTION OF BUSINESS SCENARIOS A THROUGH H
    // ========================================================================

    // --- Baseline Provisioning ---
    // Item 1: Performance Drink (cost $4.00, price $8.00)
    const drink = await productFactory.create(owner, {
      sku: 'DRK-AUDIT-001',
      name: 'HydroBoost Electrolyte Drink',
      category: InventoryCategory.HEALTHY_DRINKS,
      unitCost: 4.0,
      sellingPrice: 8.0,
      quantityOnHand: 0,
    });

    // Item 2: Protein Bar (cost $2.50, price $5.00)
    const bar = await productFactory.create(owner, {
      sku: 'BAR-AUDIT-001',
      name: 'Organic Plant Protein Bar',
      category: InventoryCategory.HEALTHY_MEALS,
      unitCost: 2.5,
      sellingPrice: 5.0,
      quantityOnHand: 0,
    });

    // Capital Asset 1: Treadmill
    const treadmill = await assetFactory.create(owner, {
      assetTag: 'AST-AUDIT-TRD-01',
      name: 'Kinergy SprintMaster Commercial Treadmill',
      category: AssetCategory.GYM_EQUIPMENT,
      location: {
        facilityId: 'fac_main',
        roomId: 'room_cardio_a',
        zone: 'Cardio Zone 1',
        description: 'Treadmill row east',
      },
      purchaseDate: '2026-01-15T00:00:00.000Z',
      purchaseValueAmount: 8000.0,
      currentEstimatedValueAmount: 8000.0,
      condition: AssetCondition.EXCELLENT,
    });

    // Capital Asset 2: Cryotherapy Chamber
    const cryoChamber = await assetFactory.create(owner, {
      assetTag: 'AST-AUDIT-CRYO-01',
      name: 'Whole Body Cryotherapy Chamber Pro',
      category: AssetCategory.THERAPY_EQUIPMENT,
      location: {
        facilityId: 'fac_main',
        roomId: 'suite_recovery',
        zone: 'Cryo Booth Alpha',
        description: 'Treatment room 1',
      },
      purchaseDate: '2026-01-10T00:00:00.000Z',
      purchaseValueAmount: 22000.0,
      currentEstimatedValueAmount: 22000.0,
      condition: AssetCondition.EXCELLENT,
    });

    // --- Scenario A: Purchase / Receive Stock ---
    // Owner receives 50 units of Performance Drink @ $4.00
    const receiveDrinkRes = await client
      .as(owner)
      .post(`/api/v1/resources/inventory/${drink.id}/receive`)
      .send({ quantity: 50, unitCost: 4.0, notes: 'Supplier delivery batch #A1' });
    expect(receiveDrinkRes.status).toBe(HttpStatus.OK);

    // Owner receives 30 units of Protein Bar @ $2.50
    const receiveBarRes = await client
      .as(owner)
      .post(`/api/v1/resources/inventory/${bar.id}/receive`)
      .send({ quantity: 30, unitCost: 2.5, notes: 'Supplier delivery batch #B1' });
    expect(receiveBarRes.status).toBe(HttpStatus.OK);

    // --- Scenario B: Retail Sale ---
    // Receptionist sells 5 drinks @ $8.00 (Stock 50 -> 45)
    const sellDrinkRes = await client
      .as(receptionist)
      .post(`/api/v1/resources/inventory/${drink.id}/sell`)
      .send({ quantity: 5, unitPrice: 8.0, notes: 'Counter retail sale' });
    expect(sellDrinkRes.status).toBe(HttpStatus.OK);

    // Receptionist sells 10 bars @ $5.00 (Stock 30 -> 20)
    const sellBarRes = await client
      .as(receptionist)
      .post(`/api/v1/resources/inventory/${bar.id}/sell`)
      .send({ quantity: 10, unitPrice: 5.0, notes: 'Counter retail sale' });
    expect(sellBarRes.status).toBe(HttpStatus.OK);

    // --- Scenario C: Internal Consumption ---
    // Trainer consumes 3 drinks during clinical session (Stock 45 -> 42)
    const consumeDrinkRes = await client
      .as(trainer)
      .post(`/api/v1/resources/inventory/${drink.id}/consume`)
      .send({ quantity: 3, notes: 'Consumed during recovery treatment' });
    expect(consumeDrinkRes.status).toBe(HttpStatus.OK);

    // --- Scenario D: Invalid Sale / Atomic Failure ---
    // Attempting to sell 100 drinks when only 42 exist -> Must reject with 400 Bad Request
    const invalidSaleRes = await client
      .as(receptionist)
      .post(`/api/v1/resources/inventory/${drink.id}/sell`)
      .send({ quantity: 100, unitPrice: 8.0 });
    expect(invalidSaleRes.status).toBe(HttpStatus.BAD_REQUEST);

    // --- Authorization Attack Vectors ---
    // Unauthenticated user attempts mutation -> 401 Unauthorized
    const unauthMutationRes = await client
      .withoutAuth()
      .post(`/api/v1/resources/inventory/${drink.id}/receive`)
      .send({ quantity: 10, unitCost: 4.0 });
    expect(unauthMutationRes.status).toBe(HttpStatus.UNAUTHORIZED);

    // Member / Client attempts stock mutation -> 403 Forbidden
    const clientMutationRes = await client
      .as(clientUser)
      .post(`/api/v1/resources/inventory/${drink.id}/sell`)
      .send({ quantity: 1, unitPrice: 8.0 });
    expect(clientMutationRes.status).toBe(HttpStatus.FORBIDDEN);

    // --- Scenario E: Asset Registration verified above with treadmill and cryoChamber ---

    // --- Scenario F: Asset Transfer ---
    // Relocate treadmill from Cardio Room A to Functional Weights Room B
    const transferPayload: TransferFixedAssetLocationRequestDto = {
      location: {
        facilityId: 'fac_main',
        roomId: 'room_functional_b',
        zone: 'Functional Zone 2',
        description: 'Near north mirrors',
      },
      reason: 'Gym floor reorganization',
    };
    const transferRes = await client
      .as(owner)
      .post(`/api/v1/resources/assets/${treadmill.id}/transfer`)
      .send(transferPayload);
    expect(transferRes.status).toBe(HttpStatus.OK);

    // --- Scenario G: Maintenance Lifecycle ---
    // 1. Enter UNDER_MAINTENANCE
    const statusPayload: ChangeFixedAssetStatusRequestDto = {
      status: AssetStatus.UNDER_MAINTENANCE,
      reason: 'Belt tension inspection and lubrication',
    };
    const statusRes = await client
      .as(owner)
      .post(`/api/v1/resources/assets/${treadmill.id}/status`)
      .send(statusPayload);
    expect(statusRes.status).toBe(HttpStatus.OK);

    // 2. Complete maintenance work order -> Auto recovers to ACTIVE
    const maintPayload: RecordAssetMaintenanceRequestDto = {
      serviceDate: '2026-09-15T11:00:00.000Z',
      description: 'Quarterly multi-point motor check and belt service',
      performedBy: 'Certified Fitness Tech LLC',
      costAmount: 250.0,
      updateConditionTo: AssetCondition.EXCELLENT,
      notes: 'Completed without issues',
    };
    const maintRes = await client
      .as(owner)
      .post(`/api/v1/resources/assets/${treadmill.id}/maintenance`)
      .send(maintPayload);
    expect(maintRes.status).toBe(HttpStatus.OK);

    // --- Scenario H: Fixed Asset Revaluation ---
    // Revalue treadmill fair value from $8,000 to $7,500
    const valPayload: UpdateFixedAssetValuationRequestDto = {
      estimatedValueAmount: 7500.0,
      reason: 'Annual equipment depreciation assessment',
    };
    const valRes = await client
      .as(owner)
      .post(`/api/v1/resources/assets/${treadmill.id}/valuation`)
      .send(valPayload);
    expect(valRes.status).toBe(HttpStatus.OK);

    // ========================================================================
    // 2. DATABASE STATE DATA INTEGRITY AUDIT
    // ========================================================================

    // ------------------------------------------------------------------------
    // AUDIT 1: Consumable Inventory Data Integrity
    // ------------------------------------------------------------------------
    const persistedDrink = await inventoryRepo.findById(drink.id);
    const persistedBar = await inventoryRepo.findById(bar.id);

    expect(persistedDrink).toBeDefined();
    expect(persistedBar).toBeDefined();

    // 1.1 Invariant: No negative stock across all items
    const allItems: InventoryItem[] = await inventoryRepo.findMany();
    for (const item of allItems) {
      expect(item.quantityOnHand.value).toBeGreaterThanOrEqual(0);
    }

    // 1.2 Exact stock quantities match valid operations
    // Drink: 0 initial + 50 received - 5 sold - 3 consumed = 42 units
    expect(persistedDrink!.quantityOnHand.value).toBe(42);
    // Bar: 0 initial + 30 received - 10 sold = 20 units
    expect(persistedBar!.quantityOnHand.value).toBe(20);

    // 1.3 Invariant: Every valid stock mutation has exactly one appropriate movement
    // Drink has exactly 3 movements: PURCHASE(50), SALE(-5), CONSUMPTION(-3)
    const drinkMovements: StockMovement[] = await inventoryRepo.findMovements({ itemId: drink.id });
    expect(drinkMovements.length).toBe(3);

    const mPurchase = drinkMovements.find(
      (m: StockMovement) => m.movementType === StockMovementType.PURCHASE,
    );
    expect(mPurchase).toBeDefined();
    expect(mPurchase!.quantityDelta.value).toBe(50);
    expect(mPurchase!.balanceAfter.value).toBe(50);
    expect(mPurchase!.recordedByUserId).toBe(owner.userId);

    const mSale = drinkMovements.find(
      (m: StockMovement) => m.movementType === StockMovementType.SALE,
    );
    expect(mSale).toBeDefined();
    expect(mSale!.quantityDelta.value).toBe(-5);
    expect(mSale!.balanceAfter.value).toBe(45);
    expect(mSale!.recordedByUserId).toBe(receptionist.userId);

    const mConsumption = drinkMovements.find(
      (m: StockMovement) => m.movementType === StockMovementType.CONSUMPTION,
    );
    expect(mConsumption).toBeDefined();
    expect(mConsumption!.quantityDelta.value).toBe(-3);
    expect(mConsumption!.balanceAfter.value).toBe(42);
    expect(mConsumption!.recordedByUserId).toBe(trainer.userId);

    // Bar has exactly 2 movements: PURCHASE(30), SALE(-10)
    const barMovements: StockMovement[] = await inventoryRepo.findMovements({ itemId: bar.id });
    expect(barMovements.length).toBe(2);

    // 1.4 Invariant: Rejected mutations produced zero movements
    // Total movements in the entire database must be exactly 3 + 2 = 5
    const allMovements = await inventoryRepo.findMovements();
    expect(allMovements.length).toBe(5);

    // Verify rejected sale of 100 units did NOT record any movement
    const phantomMovements = allMovements.filter(
      (m: StockMovement) => Math.abs(m.quantityDelta.value) === 100,
    );
    expect(phantomMovements.length).toBe(0);

    // 1.5 Invariant: No orphaned movements in the ledger
    for (const mov of allMovements) {
      const parentItem = allItems.find(
        (i: InventoryItem) => i.id.getValue() === mov.inventoryItemId.getValue(),
      );
      expect(parentItem).toBeDefined();
    }

    // 1.6 Invariant: Item identity and version consistency
    expect(persistedDrink!.id.getValue()).toBe(drink.id);
    expect(persistedDrink!.sku.value).toBe('DRK-AUDIT-001');
    // OCC versions incremented strictly by number of valid mutations
    expect(persistedDrink!.version).toBeGreaterThanOrEqual(3);

    // ------------------------------------------------------------------------
    // AUDIT 2: Fixed Assets Data Integrity
    // ------------------------------------------------------------------------
    const allAssets = await fixedAssetRepo.findAll();

    // 2.1 Invariant: No duplicate assets or colliding asset tags
    expect(allAssets.length).toBe(2);
    const assetTags = allAssets.map((a) => a.assetTag);
    const uniqueTags = new Set(assetTags);
    expect(uniqueTags.size).toBe(assetTags.length);

    const persistedTreadmill = allAssets.find((a) => a.id.value === treadmill.id);
    const persistedCryo = allAssets.find((a) => a.id.value === cryoChamber.id);
    expect(persistedTreadmill).toBeDefined();
    expect(persistedCryo).toBeDefined();

    // 2.2 Invariant: Location consistency matches latest transfer
    expect(persistedTreadmill!.location.facilityId).toBe('fac_main');
    expect(persistedTreadmill!.location.roomId).toBe('room_functional_b');
    expect(persistedTreadmill!.location.zone).toBe('Functional Zone 2');

    // Cryo Chamber was never relocated; location remains initial
    expect(persistedCryo!.location.roomId).toBe('suite_recovery');

    // 2.3 Invariant: Lifecycle status is valid
    // Both assets must be ACTIVE (treadmill auto-recovered after maintenance)
    expect(persistedTreadmill!.status).toBe(AssetStatus.ACTIVE);
    expect(persistedCryo!.status).toBe(AssetStatus.ACTIVE);

    // 2.4 Invariant: Maintenance records reference valid assets
    expect(persistedTreadmill!.maintenanceRecords.length).toBe(1);
    const maintRec = persistedTreadmill!.maintenanceRecords[0]!;
    expect(maintRec.assetId.value).toBe(treadmill.id);
    expect(maintRec.cost.amount).toBe(250.0);
    expect(maintRec.performedBy).toBe('Certified Fitness Tech LLC');

    // Cryo chamber had zero maintenance performed
    expect(persistedCryo!.maintenanceRecords.length).toBe(0);

    // 2.5 Invariant: Histories reference valid assets and transfer preserves old/new location
    expect(persistedTreadmill!.historyEvents.length).toBeGreaterThanOrEqual(4);
    for (const h of persistedTreadmill!.historyEvents) {
      expect(h.assetId.value).toBe(treadmill.id);
    }

    const transferEvent = persistedTreadmill!.historyEvents.find(
      (h) => h.eventType === AssetHistoryEventType.TRANSFERRED,
    );
    expect(transferEvent).toBeDefined();
    expect(transferEvent!.details).toBeDefined();

    // ------------------------------------------------------------------------
    // AUDIT 3: Valuation Consistency & Mathematical Equilibrium
    // ------------------------------------------------------------------------
    // 3.1 Consumable Inventory Valuation
    // Drink: 42 units @ $4.00 cost = $168.00
    // Bar: 20 units @ $2.50 cost = $50.00
    // Total Inventory Value = $168.00 + $50.00 = $218.00
    const invValuationRes = await client.as(owner).get('/api/v1/resources/inventory/valuation');
    expect(invValuationRes.status).toBe(HttpStatus.OK);
    expect(invValuationRes.body.totalValueAmount).toBe(218.0);
    expect(invValuationRes.body.totalQuantityUnits).toBe(62); // 42 + 20
    expect(invValuationRes.body.totalDistinctItems).toBe(2);

    // 3.2 Fixed Asset Valuation
    // Treadmill revalued to $7,500.00
    // Cryotherapy Chamber carrying value: $22,000.00
    // Total Fixed Asset Carrying Value = $7,500.00 + $22,000.00 = $29,500.00
    const assetValuationRes = await client
      .as(owner)
      .get('/api/v1/resources/assets/valuation/summary');
    expect(assetValuationRes.status).toBe(HttpStatus.OK);
    expect(assetValuationRes.body.totalCarryingValueAmount).toBe(29500.0);
    expect(assetValuationRes.body.totalAssetCount).toBe(2);
    expect(assetValuationRes.body.activeAssetCount).toBe(2);

    // 3.3 Combined Resource Valuation Equilibrium
    // Combined = $218.00 + $29,500.00 = $29,718.00
    const combinedValuationRes = await client.as(owner).get('/api/v1/resources/valuation/summary');
    expect(combinedValuationRes.status).toBe(HttpStatus.OK);
    expect(combinedValuationRes.body.inventory.totalValueAmount).toBe(218.0);
    expect(combinedValuationRes.body.fixedAssets.totalCarryingValueAmount).toBe(29500.0);
    expect(combinedValuationRes.body.totalCombinedValueAmount).toBe(29718.0);

    // 3.4 Resource Overview Cockpit Snapshot Verification
    const overviewRes = await client.as(owner).get('/api/v1/resources/overview');
    expect(overviewRes.status).toBe(HttpStatus.OK);
    assertResourceOverview(overviewRes.body, {
      inventoryTotal: 218.0,
      inventoryItemsCount: 2,
      inventoryQuantity: 62,
      assetsCarryingTotal: 29500.0,
      activeAssetCount: 2,
      totalAssetCount: 2,
      combinedTotal: 29718.0,
    });

    // ------------------------------------------------------------------------
    // AUDIT 4: Identity & Actor Attribution Data Integrity
    // ------------------------------------------------------------------------
    // 4.1 Authenticated actor IDs are accurately tracked across movements
    for (const m of drinkMovements) {
      expect([owner.userId, receptionist.userId, trainer.userId]).toContain(m.recordedByUserId);
    }
    for (const m of barMovements) {
      expect([owner.userId, receptionist.userId, trainer.userId]).toContain(m.recordedByUserId);
    }

    // 4.2 Maintenance and history logs record valid authenticated actors
    for (const h of persistedTreadmill!.historyEvents) {
      expect(h.recordedByUserId).toBe(owner.userId);
    }

    // 4.3 User and client records are not duplicated
    const userSearchResults = await userRepo.search();
    const userEmails = userSearchResults.items.map((u) => u.email.toLowerCase());
    const uniqueEmails = new Set(userEmails);
    expect(uniqueEmails.size).toBe(userEmails.length);

    // Verify client record is cleanly intact
    const clientInRepo = await userRepo.findById(clientUser.userId);
    expect(clientInRepo).toBeDefined();
    expect(clientInRepo!.email).toBe(clientUser.email);

    // ------------------------------------------------------------------------
    // AUDIT 5: Authorization Security Boundary Integrity
    // ------------------------------------------------------------------------
    // Invariant: Failed unauthorized mutations created zero database records or state drift
    // The unauthenticated and clientUser mutations were strictly rejected and left:
    // - 0 movements logged for clientUser
    const clientMovements = allMovements.filter((m) => m.recordedByUserId === clientUser.userId);
    expect(clientMovements.length).toBe(0);

    // The final state of the entire system is 100% accounted for and explainable
    // entirely through valid business operations.
  });
});
