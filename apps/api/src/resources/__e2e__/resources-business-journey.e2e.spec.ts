import { HttpStatus } from '@nestjs/common';
import {
  InventoryCategory,
  StockMovementType,
  AssetCategory,
  AssetStatus,
  AssetCondition,
  AssetHistoryEventType,
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

describe('Phase 6: Complete Multi-Scenario Business Journey (A Day in Kinergy Resources Management)', () => {
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

  it('orchestrates a complete, deterministic Kinergy business day across inventory, assets, maintenance, and valuation with end-of-day mathematical and invariant consistency', async () => {
    const { client, productFactory, assetFactory, inventoryRepo, fixedAssetRepo } = env;
    const { owner, receptionist, trainer, clientUser } = env.personas;

    // ========================================================================
    // PHASE 1: MORNING CATALOG & CAPITAL FLEET PROVISIONING (INITIAL STATE)
    // ========================================================================
    // 1. Catalog Consumable Item 1: Electrolyte Performance Drink
    const drink = await productFactory.create(owner, {
      sku: 'DRK-ELECTRO-DAY-001',
      name: 'Electrolyte Performance Drink',
      category: InventoryCategory.HEALTHY_DRINKS,
      unitCost: 4.0,
      sellingPrice: 8.0,
      quantityOnHand: 0,
    });

    // 2. Catalog Consumable Item 2: Keto Salmon Superfood Bowl
    const meal = await productFactory.create(owner, {
      sku: 'MEL-SALMON-DAY-001',
      name: 'Keto Salmon Superfood Bowl',
      category: InventoryCategory.HEALTHY_MEALS,
      unitCost: 7.5,
      sellingPrice: 15.0,
      quantityOnHand: 0,
    });

    // 3. Register Capital Fixed Asset 1: Commercial Treadmill
    const treadmill = await assetFactory.create(owner, {
      assetTag: 'AST-TRD-DAY-001',
      name: 'Kinergy SprintMaster Commercial Treadmill',
      category: AssetCategory.GYM_EQUIPMENT,
      location: {
        facilityId: 'fac_main',
        roomId: 'area_cardio',
        zone: 'Cardio Zone North',
        description: 'Cardio station 1',
      },
      purchaseValueAmount: 9000.0,
      currentEstimatedValueAmount: 9000.0,
      condition: AssetCondition.EXCELLENT,
    });

    // 4. Register Capital Fixed Asset 2: Clinical Cryotherapy Chamber
    const cryoChamber = await assetFactory.create(owner, {
      assetTag: 'AST-CRYO-DAY-001',
      name: 'Hyperbaric CryoRecovery Chamber Pro',
      category: AssetCategory.THERAPY_EQUIPMENT,
      location: {
        facilityId: 'fac_main',
        roomId: 'suite_recovery',
        zone: 'Recovery Suite Alpha',
        description: 'Chamber booth 1',
      },
      purchaseValueAmount: 25000.0,
      currentEstimatedValueAmount: 25000.0,
      condition: AssetCondition.EXCELLENT,
    });

    // Baseline catalog check: 2 inventory items, 2 fixed assets provisioned
    expect(drink.id).toBeDefined();
    expect(meal.id).toBeDefined();
    expect(treadmill.id).toBeDefined();
    expect(cryoChamber.id).toBeDefined();

    // ========================================================================
    // PHASE 2: DAYTIME BUSINESS OPERATIONS & BALANCED TRANSACTIONS
    // ========================================================================

    // ------------------------------------------------------------------------
    // Operation 1: Morning Delivery Receipt - Purchase 50 Healthy Drinks
    // ------------------------------------------------------------------------
    const receiveDrinksRes = await client
      .as(owner)
      .post(`/api/v1/resources/inventory/${drink.id}/receive`)
      .send({
        quantity: 50,
        unitCost: 4.0,
        referenceNumber: 'PO-DRK-20260915',
        notes: 'Morning wholesale beverage delivery',
      });
    expect(receiveDrinksRes.status).toBe(HttpStatus.OK);
    expect(receiveDrinksRes.body.item.quantityOnHand).toBe(50);

    // ------------------------------------------------------------------------
    // Operation 2: Morning Delivery Receipt - Purchase 20 Healthy Meals
    // ------------------------------------------------------------------------
    const receiveMealsRes = await client
      .as(owner)
      .post(`/api/v1/resources/inventory/${meal.id}/receive`)
      .send({
        quantity: 20,
        unitCost: 7.5,
        referenceNumber: 'PO-MEL-20260915',
        notes: 'Fresh kitchen meal delivery',
      });
    expect(receiveMealsRes.status).toBe(HttpStatus.OK);
    expect(receiveMealsRes.body.item.quantityOnHand).toBe(20);

    // ------------------------------------------------------------------------
    // Operation 3: Midday Front-Desk Retail Checkout - Sell 5 Healthy Drinks
    // ------------------------------------------------------------------------
    const sellDrinksRes = await client
      .as(receptionist)
      .post(`/api/v1/resources/inventory/${drink.id}/sell`)
      .send({
        quantity: 5,
        unitPrice: 8.0,
        referenceId: 'POS-REC-DAY-101',
        notes: 'Front-desk point-of-sale retail purchase',
      });
    expect(sellDrinksRes.status).toBe(HttpStatus.OK);
    expect(sellDrinksRes.body.item.quantityOnHand).toBe(45);

    // ------------------------------------------------------------------------
    // Operation 4: Clinical Therapy Usage - Consume 3 Healthy Drinks
    // ------------------------------------------------------------------------
    const consumeDrinksRes = await client
      .as(trainer)
      .post(`/api/v1/resources/inventory/${drink.id}/consume`)
      .send({
        quantity: 3,
        treatmentSessionId: 'CLINIC-HYDRATE-DAY-003',
        notes: 'Pre-session hydration provided for VIP cryotherapy patients',
      });
    expect(consumeDrinksRes.status).toBe(HttpStatus.OK);
    expect(consumeDrinksRes.body.item.quantityOnHand).toBe(42);

    // ------------------------------------------------------------------------
    // Operation 5: Floor Equipment Reconfiguration - Transfer Treadmill
    // ------------------------------------------------------------------------
    const transferPayload: TransferFixedAssetLocationRequestDto = {
      location: {
        facilityId: 'fac_main',
        roomId: 'area_hiit',
        zone: 'High-Intensity Zone South',
        description: 'Reallocated to functional HIIT zone',
      },
      reason: 'Gym floor optimization for peak afternoon traffic',
    };
    const transferRes = await client
      .as(owner)
      .post(`/api/v1/resources/assets/${treadmill.id}/transfer`)
      .send(transferPayload);
    expect(transferRes.status).toBe(HttpStatus.OK);
    expect(transferRes.body.location.roomId).toBe('area_hiit');
    expect(transferRes.body.location.zone).toBe('High-Intensity Zone South');

    // ------------------------------------------------------------------------
    // Operation 6: Maintenance Induction - Put Cryotherapy Chamber Under Maintenance
    // ------------------------------------------------------------------------
    const startMaintenanceStatusPayload: ChangeFixedAssetStatusRequestDto = {
      status: AssetStatus.UNDER_MAINTENANCE,
      reason: 'Scheduled quarterly cryogenic nozzle inspection and pressure sealing',
    };
    const startMaintRes = await client
      .as(owner)
      .post(`/api/v1/resources/assets/${cryoChamber.id}/status`)
      .send(startMaintenanceStatusPayload);
    expect(startMaintRes.status).toBe(HttpStatus.OK);
    expect(startMaintRes.body.status).toBe(AssetStatus.UNDER_MAINTENANCE);

    // ------------------------------------------------------------------------
    // Operation 7: Maintenance Completion - Record Servicing & Return to Active
    // ------------------------------------------------------------------------
    const recordMaintenancePayload: RecordAssetMaintenanceRequestDto = {
      serviceDate: new Date('2026-09-15T11:00:00.000Z').toISOString(),
      costAmount: 450.0,
      costCurrency: 'USD',
      description: 'Replaced vacuum pressure gasket and calibrated thermal sensors',
      performedBy: 'Certified CryoTech Services Inc.',
      updateConditionTo: AssetCondition.EXCELLENT,
      notes: 'Passed dynamic pressure validation tests; restored to active service',
    };
    const logMaintRes = await client
      .as(owner)
      .post(`/api/v1/resources/assets/${cryoChamber.id}/maintenance`)
      .send(recordMaintenancePayload);
    expect(logMaintRes.status).toBe(HttpStatus.OK);
    expect(logMaintRes.body.id).toBeDefined();

    // Verify maintenance completion automatically restored asset status to ACTIVE
    const activeCheckRes = await client.as(owner).get(`/api/v1/resources/assets/${cryoChamber.id}`);
    expect(activeCheckRes.status).toBe(HttpStatus.OK);
    expect(activeCheckRes.body.status).toBe(AssetStatus.ACTIVE);
    expect(activeCheckRes.body.condition).toBe(AssetCondition.EXCELLENT);

    // ------------------------------------------------------------------------
    // Operation 8: Capital Asset Revaluation - Write-Down / Revalue Treadmill
    // ------------------------------------------------------------------------
    // Annual fair-market appraisal write-down: $9,000.00 -> $8,100.00 (-$900.00)
    const revaluationPayload: UpdateFixedAssetValuationRequestDto = {
      estimatedValueAmount: 8100.0,
      currency: 'USD',
      reason: 'Annual balance-sheet depreciation and market appraisal write-down',
    };
    const revalueRes = await client
      .as(owner)
      .post(`/api/v1/resources/assets/${treadmill.id}/valuation`)
      .send(revaluationPayload);
    expect(revalueRes.status).toBe(HttpStatus.OK);
    expect(revalueRes.body.currentEstimatedValueAmount).toBeCloseTo(8100.0, 2);

    // ------------------------------------------------------------------------
    // Operation 9: Security Gate Invariant - Reject Unauthorized Client Operation
    // ------------------------------------------------------------------------
    const unauthorizedAttempt = await client
      .as(clientUser)
      .post(`/api/v1/resources/inventory/${drink.id}/receive`)
      .send({
        quantity: 100,
        unitCost: 1.0,
        notes: 'Malicious client unauthorized stock infusion attempt',
      });
    expect(unauthorizedAttempt.status).toBe(HttpStatus.FORBIDDEN);

    // ------------------------------------------------------------------------
    // Operation 10: Executive Overview Query
    // ------------------------------------------------------------------------
    const overviewRes = await client.as(owner).get('/api/v1/resources/overview');
    expect(overviewRes.status).toBe(HttpStatus.OK);

    // ========================================================================
    // PHASE 3: EVENING AUDIT & COMPREHENSIVE END-OF-DAY CONSISTENCY PROOFS
    // ========================================================================

    // ------------------------------------------------------------------------
    // 1. Correct Consumable Stock
    // ------------------------------------------------------------------------
    // Healthy Drink: 0 + 50 (purchased) - 5 (sold) - 3 (consumed) = 42
    const drinkStockRes = await client
      .as(owner)
      .get(`/api/v1/resources/inventory/${drink.id}/stock-level`);
    expect(drinkStockRes.status).toBe(HttpStatus.OK);
    expect(drinkStockRes.body.quantityOnHand).toBe(42);

    // Healthy Meal: 0 + 20 (purchased) = 20
    const mealStockRes = await client
      .as(owner)
      .get(`/api/v1/resources/inventory/${meal.id}/stock-level`);
    expect(mealStockRes.status).toBe(HttpStatus.OK);
    expect(mealStockRes.body.quantityOnHand).toBe(20);

    // Total consumable stock units across enterprise = 42 + 20 = 62
    const allItemsRes = await client.as(owner).get('/api/v1/resources/inventory');
    expect(allItemsRes.status).toBe(HttpStatus.OK);
    expect(allItemsRes.body.total).toBe(2);
    const totalStock = allItemsRes.body.items.reduce(
      (acc: number, item: { quantityOnHand: number }) => acc + item.quantityOnHand,
      0,
    );
    expect(totalStock).toBe(62);

    // ------------------------------------------------------------------------
    // 2. Complete Movement History
    // ------------------------------------------------------------------------
    // Healthy Drink: exactly 3 movements (1 PURCHASE, 1 SALE, 1 CONSUMPTION)
    const drinkMovementsRes = await client
      .as(owner)
      .get(`/api/v1/resources/inventory/${drink.id}/movements`);
    expect(drinkMovementsRes.status).toBe(HttpStatus.OK);
    expect(drinkMovementsRes.body.items.length).toBe(3);

    const purchaseMv = drinkMovementsRes.body.items.find(
      (m: { movementType: string }) => m.movementType === StockMovementType.PURCHASE,
    );
    expect(purchaseMv).toBeDefined();
    expect(purchaseMv.quantityDelta).toBe(50);
    expect(purchaseMv.balanceAfter).toBe(50);

    const saleMv = drinkMovementsRes.body.items.find(
      (m: { movementType: string }) => m.movementType === StockMovementType.SALE,
    );
    expect(saleMv).toBeDefined();
    expect(saleMv.quantityDelta).toBe(-5);
    expect(saleMv.balanceAfter).toBe(45);

    const consumeMv = drinkMovementsRes.body.items.find(
      (m: { movementType: string }) => m.movementType === StockMovementType.CONSUMPTION,
    );
    expect(consumeMv).toBeDefined();
    expect(consumeMv.quantityDelta).toBe(-3);
    expect(consumeMv.balanceAfter).toBe(42);

    // Healthy Meal: exactly 1 movement (1 PURCHASE)
    const mealMovementsRes = await client
      .as(owner)
      .get(`/api/v1/resources/inventory/${meal.id}/movements`);
    expect(mealMovementsRes.status).toBe(HttpStatus.OK);
    expect(mealMovementsRes.body.items.length).toBe(1);
    expect(mealMovementsRes.body.items[0].movementType).toBe(StockMovementType.PURCHASE);
    expect(mealMovementsRes.body.items[0].quantityDelta).toBe(20);
    expect(mealMovementsRes.body.items[0].balanceAfter).toBe(20);

    // ------------------------------------------------------------------------
    // 3. Correct Fixed Asset Locations
    // ------------------------------------------------------------------------
    const treadmillRes = await client.as(owner).get(`/api/v1/resources/assets/${treadmill.id}`);
    expect(treadmillRes.status).toBe(HttpStatus.OK);
    expect(treadmillRes.body.location.roomId).toBe('area_hiit');
    expect(treadmillRes.body.location.zone).toBe('High-Intensity Zone South');

    const cryoRes = await client.as(owner).get(`/api/v1/resources/assets/${cryoChamber.id}`);
    expect(cryoRes.status).toBe(HttpStatus.OK);
    expect(cryoRes.body.location.roomId).toBe('suite_recovery');
    expect(cryoRes.body.location.zone).toBe('Recovery Suite Alpha');

    // Verify Treadmill Transfer History preserves audit trail
    const treadmillHistoryRes = await client
      .as(owner)
      .get(`/api/v1/resources/assets/${treadmill.id}/history`);
    expect(treadmillHistoryRes.status).toBe(HttpStatus.OK);
    const transferEvents = treadmillHistoryRes.body.items.filter(
      (ev: { eventType: string }) => ev.eventType === AssetHistoryEventType.TRANSFERRED,
    );
    expect(transferEvents.length).toBe(1);
    expect(transferEvents[0].details.priorLocation.roomId).toBe('area_cardio');
    expect(transferEvents[0].details.priorLocation.zone).toBe('Cardio Zone North');
    expect(transferEvents[0].details.newLocation.roomId).toBe('area_hiit');
    expect(transferEvents[0].details.newLocation.zone).toBe('High-Intensity Zone South');

    // ------------------------------------------------------------------------
    // 4. Correct Asset Status
    // ------------------------------------------------------------------------
    expect(treadmillRes.body.status).toBe(AssetStatus.ACTIVE);
    expect(cryoRes.body.status).toBe(AssetStatus.ACTIVE);

    // ------------------------------------------------------------------------
    // 5. Complete Maintenance History
    // ------------------------------------------------------------------------
    const cryoMaintenanceRes = await client
      .as(owner)
      .get(`/api/v1/resources/assets/${cryoChamber.id}/maintenance`);
    expect(cryoMaintenanceRes.status).toBe(HttpStatus.OK);
    expect(cryoMaintenanceRes.body.items.length).toBe(1);
    expect(cryoMaintenanceRes.body.items[0].costAmount).toBe(450.0);
    expect(cryoMaintenanceRes.body.items[0].performedBy).toBe('Certified CryoTech Services Inc.');

    // Asset history tracks full lifecycle status cycle: CREATED -> STATUS_CHANGED (to UNDER_MAINTENANCE) -> MAINTENANCE_RECORDED
    const cryoHistoryRes = await client
      .as(owner)
      .get(`/api/v1/resources/assets/${cryoChamber.id}/history`);
    expect(cryoHistoryRes.status).toBe(HttpStatus.OK);
    const eventTypes = cryoHistoryRes.body.items.map((e: { eventType: string }) => e.eventType);
    expect(eventTypes).toContain(AssetHistoryEventType.CREATED);
    expect(eventTypes).toContain(AssetHistoryEventType.STATUS_CHANGED);
    expect(eventTypes).toContain(AssetHistoryEventType.MAINTENANCE_RECORDED);

    const statusChangeEvent = cryoHistoryRes.body.items.find(
      (e: { eventType: string }) => e.eventType === AssetHistoryEventType.STATUS_CHANGED,
    );
    expect(statusChangeEvent.details.priorStatus).toBe(AssetStatus.ACTIVE);
    expect(statusChangeEvent.details.newStatus).toBe(AssetStatus.UNDER_MAINTENANCE);

    const maintEvent = cryoHistoryRes.body.items.find(
      (e: { eventType: string }) => e.eventType === AssetHistoryEventType.MAINTENANCE_RECORDED,
    );
    expect(maintEvent).toBeDefined();
    expect(maintEvent.details.performedBy).toBe('Certified CryoTech Services Inc.');

    // ------------------------------------------------------------------------
    // 6. Correct Individual Valuations
    // ------------------------------------------------------------------------
    // Consumable Inventory: (42 * $4.00) + (20 * $7.50) = $168.00 + $150.00 = $318.00
    const expectedInventoryTotal = 318.0;
    const invValRes = await client.as(owner).get('/api/v1/resources/inventory/valuation');
    expect(invValRes.status).toBe(HttpStatus.OK);
    expect(invValRes.body.totalValueAmount).toBeCloseTo(expectedInventoryTotal, 2);
    expect(invValRes.body.totalQuantityUnits).toBe(62);
    expect(invValRes.body.totalDistinctItems).toBe(2);

    // Fixed Assets Carrying: Treadmill ($8,100.00) + Cryo Chamber ($25,000.00) = $33,100.00
    // Fixed Assets Purchase Capex: $9,000.00 + $25,000.00 = $34,000.00
    const expectedAssetsCarryingTotal = 33100.0;
    const expectedAssetsPurchaseTotal = 34000.0;
    const assetValRes = await client.as(owner).get('/api/v1/resources/assets/valuation/summary');
    expect(assetValRes.status).toBe(HttpStatus.OK);
    expect(assetValRes.body.totalCarryingValueAmount).toBeCloseTo(expectedAssetsCarryingTotal, 2);
    expect(assetValRes.body.totalPurchaseValueAmount).toBeCloseTo(expectedAssetsPurchaseTotal, 2);
    expect(assetValRes.body.totalAssetCount).toBe(2);
    expect(assetValRes.body.activeAssetCount).toBe(2);

    // ------------------------------------------------------------------------
    // 7. Correct Combined Valuation & Zero Double-Counting Proof
    // ------------------------------------------------------------------------
    // Combined = $318.00 + $33,100.00 = $33,418.00
    const expectedCombinedTotal = expectedInventoryTotal + expectedAssetsCarryingTotal; // $33,418.00
    const combValRes = await client.as(owner).get('/api/v1/resources/valuation/summary');
    expect(combValRes.status).toBe(HttpStatus.OK);
    expect(combValRes.body.inventory.totalValueAmount).toBeCloseTo(expectedInventoryTotal, 2);
    expect(combValRes.body.fixedAssets.totalCarryingValueAmount).toBeCloseTo(
      expectedAssetsCarryingTotal,
      2,
    );
    expect(combValRes.body.totalCombinedValueAmount).toBeCloseTo(expectedCombinedTotal, 2);

    // Mathematical Proof of Zero Double-Counting: Combined identically equals Inventory + Fixed Assets
    expect(combValRes.body.totalCombinedValueAmount).toBeCloseTo(
      invValRes.body.totalValueAmount + assetValRes.body.totalCarryingValueAmount,
      2,
    );

    // Executive Overview Dashboard confirms identical aggregated figures
    assertResourceOverview(overviewRes.body, {
      inventoryTotal: expectedInventoryTotal,
      inventoryQuantity: 62,
      inventoryItemsCount: 2,
      assetsCarryingTotal: expectedAssetsCarryingTotal,
      activeAssetCount: 2,
      totalAssetCount: 2,
      combinedTotal: expectedCombinedTotal,
    });

    // ------------------------------------------------------------------------
    // 8. Invariant Audit: No Negative Stock
    // ------------------------------------------------------------------------
    const repoItems = await inventoryRepo.findMany();
    for (const item of repoItems) {
      expect(item.quantityOnHand.value).toBeGreaterThanOrEqual(0);
    }

    // ------------------------------------------------------------------------
    // 9. Invariant Audit: No Duplicated Entities
    // ------------------------------------------------------------------------
    expect(repoItems.length).toBe(2);
    const itemIds = new Set(repoItems.map((i) => i.id.getValue()));
    expect(itemIds.size).toBe(2);

    const repoAssets = await fixedAssetRepo.findAll();
    expect(repoAssets.length).toBe(2);
    const assetIds = new Set(repoAssets.map((a) => a.id.value));
    expect(assetIds.size).toBe(2);

    // ------------------------------------------------------------------------
    // 10. Invariant Audit: No Orphaned History
    // ------------------------------------------------------------------------
    for (const item of repoItems) {
      for (const movement of item.movements) {
        expect(itemIds.has(movement.inventoryItemId.getValue())).toBe(true);
      }
    }

    for (const a of repoAssets) {
      for (const event of a.historyEvents) {
        expect(assetIds.has(event.assetId.value)).toBe(true);
      }
      for (const maint of a.maintenanceRecords) {
        expect(assetIds.has(maint.assetId.value)).toBe(true);
      }
    }

    // ------------------------------------------------------------------------
    // 11. Invariant Audit: No Unauthorized Operation Leakage
    // ------------------------------------------------------------------------
    // Verify unauthorized attempt created 0 movements and 0 stock changes on drink
    const drinkItem = await inventoryRepo.findById(drink.id);
    expect(drinkItem?.quantityOnHand.value).toBe(42);
    expect(drinkItem?.movements.length).toBe(3);
  });
});
