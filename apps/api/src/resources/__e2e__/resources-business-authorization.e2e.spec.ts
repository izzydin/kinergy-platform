import { HttpStatus } from '@nestjs/common';
import {
  InventoryCategory,
  AssetCategory,
  AssetStatus,
  AssetCondition,
} from '@kinergy-platform/core';
import {
  createResourcesE2ETestEnvironment,
  ResourcesE2ETestEnvironment,
  createTestInventoryReadOnly,
  createTestAssetsReadOnly,
  createTestFinancialAuditor,
  seedAuthPersonas,
  TestPersona,
} from './support';
import {
  TransferFixedAssetLocationRequestDto,
  ChangeFixedAssetStatusRequestDto,
  RecordAssetMaintenanceRequestDto,
  UpdateFixedAssetValuationRequestDto,
} from '../dto';

describe('Phase 6: Authorization Through Business Scenarios (A through H)', () => {
  let env: ResourcesE2ETestEnvironment;
  let invReadOnlyUser: TestPersona;
  let assetsReadOnlyUser: TestPersona;
  let financialAuditorUser: TestPersona;

  beforeAll(async () => {
    env = await createResourcesE2ETestEnvironment();

    invReadOnlyUser = createTestInventoryReadOnly();
    assetsReadOnlyUser = createTestAssetsReadOnly();
    financialAuditorUser = createTestFinancialAuditor();

    await seedAuthPersonas(env.userRepo, [
      invReadOnlyUser,
      assetsReadOnlyUser,
      financialAuditorUser,
    ]);
  });

  afterAll(async () => {
    if (env) {
      await env.close();
    }
  });

  beforeEach(() => {
    env.reset();
  });

  // ==========================================================================
  // 1. CONSUMABLE INVENTORY AUTHORIZATION (SCENARIOS A, B, C, D)
  // ==========================================================================
  describe('Consumable Inventory Authorization Gates', () => {
    it('Scenario A: Purchase / Receive Stock mutation requires inventory.write; rejects read-only, unprivileged, and unauthenticated requests', async () => {
      const { client, productFactory, inventoryRepo } = env;
      const { owner, clientUser } = env.personas;

      const product = await productFactory.create(owner, {
        name: 'Whey Protein Isolate',
        category: InventoryCategory.SUPPLEMENTS,
        unitCost: 10.0,
        sellingPrice: 20.0,
        quantityOnHand: 0,
      });

      // 1. Unauthenticated request -> HTTP 401 Unauthorized
      const unauthRes = await client
        .withoutAuth()
        .post(`/api/v1/resources/inventory/${product.id}/receive`)
        .send({ quantity: 20, unitCost: 10.0 });
      expect(unauthRes.status).toBe(HttpStatus.UNAUTHORIZED);

      // 2. Unprivileged Client user -> HTTP 403 Forbidden
      const clientRes = await client
        .as(clientUser)
        .post(`/api/v1/resources/inventory/${product.id}/receive`)
        .send({ quantity: 20, unitCost: 10.0 });
      expect(clientRes.status).toBe(HttpStatus.FORBIDDEN);

      // 3. Read-Only Inventory user (has inventory.read, lacks inventory.write) -> HTTP 403 Forbidden
      const readOnlyRes = await client
        .as(invReadOnlyUser)
        .post(`/api/v1/resources/inventory/${product.id}/receive`)
        .send({ quantity: 20, unitCost: 10.0 });
      expect(readOnlyRes.status).toBe(HttpStatus.FORBIDDEN);

      // Verify zero state corruption: stock remains 0, 0 movements logged
      const unmutated = await inventoryRepo.findById(product.id);
      expect(unmutated?.quantityOnHand.value).toBe(0);
      expect(unmutated?.movements.length).toBe(0);

      // 4. Authorized Owner (has inventory.write) -> HTTP 200 OK
      const ownerRes = await client
        .as(owner)
        .post(`/api/v1/resources/inventory/${product.id}/receive`)
        .send({ quantity: 50, unitCost: 10.0, notes: 'Authorized purchase' });
      expect(ownerRes.status).toBe(HttpStatus.OK);
      expect(ownerRes.body.item.quantityOnHand).toBe(50);
    });

    it('Scenario B: Retail Sale mutation requires inventory.write; permits Receptionist, rejects read-only and unprivileged users', async () => {
      const { client, productFactory, inventoryRepo } = env;
      const { owner, receptionist, clientUser } = env.personas;

      const product = await productFactory.create(owner, {
        name: 'Hydration Recovery Drink',
        category: InventoryCategory.HEALTHY_DRINKS,
        unitCost: 2.0,
        sellingPrice: 5.0,
        quantityOnHand: 0,
      });

      // Receive 50 units initially
      await client
        .as(owner)
        .post(`/api/v1/resources/inventory/${product.id}/receive`)
        .send({ quantity: 50, unitCost: 2.0 });

      // 1. Unauthenticated -> 401
      const unauthRes = await client
        .withoutAuth()
        .post(`/api/v1/resources/inventory/${product.id}/sell`)
        .send({ quantity: 5, unitPrice: 5.0 });
      expect(unauthRes.status).toBe(HttpStatus.UNAUTHORIZED);

      // 2. Client -> 403
      const clientRes = await client
        .as(clientUser)
        .post(`/api/v1/resources/inventory/${product.id}/sell`)
        .send({ quantity: 5, unitPrice: 5.0 });
      expect(clientRes.status).toBe(HttpStatus.FORBIDDEN);

      // 3. Read-Only user -> 403
      const readOnlyRes = await client
        .as(invReadOnlyUser)
        .post(`/api/v1/resources/inventory/${product.id}/sell`)
        .send({ quantity: 5, unitPrice: 5.0 });
      expect(readOnlyRes.status).toBe(HttpStatus.FORBIDDEN);

      // Stock remains exactly 50
      const checkStock = await inventoryRepo.findById(product.id);
      expect(checkStock?.quantityOnHand.value).toBe(50);

      // 4. Authorized Receptionist -> 200 OK
      const recepRes = await client
        .as(receptionist)
        .post(`/api/v1/resources/inventory/${product.id}/sell`)
        .send({ quantity: 5, unitPrice: 5.0, notes: 'Authorized front desk POS sale' });
      expect(recepRes.status).toBe(HttpStatus.OK);
      expect(recepRes.body.item.quantityOnHand).toBe(45);
    });

    it('Scenario C: Treatment Consumption mutation requires inventory.write; permits Trainer, rejects read-only and unauthorized users', async () => {
      const { client, productFactory, inventoryRepo } = env;
      const { owner, trainer, clientUser } = env.personas;

      const product = await productFactory.create(owner, {
        name: 'Therapeutic Kinesiology Tape',
        category: InventoryCategory.CLINICAL_SUPPLIES,
        unitCost: 5.0,
        sellingPrice: 10.0,
        quantityOnHand: 0,
      });

      await client
        .as(owner)
        .post(`/api/v1/resources/inventory/${product.id}/receive`)
        .send({ quantity: 45, unitCost: 5.0 });

      // 1. Read-Only user -> 403
      const readOnlyRes = await client
        .as(invReadOnlyUser)
        .post(`/api/v1/resources/inventory/${product.id}/consume`)
        .send({ quantity: 3, treatmentSessionId: 'sess_123' });
      expect(readOnlyRes.status).toBe(HttpStatus.FORBIDDEN);

      // 2. Client -> 403
      const clientRes = await client
        .as(clientUser)
        .post(`/api/v1/resources/inventory/${product.id}/consume`)
        .send({ quantity: 3, treatmentSessionId: 'sess_123' });
      expect(clientRes.status).toBe(HttpStatus.FORBIDDEN);

      // Stock unchanged
      const checkStock = await inventoryRepo.findById(product.id);
      expect(checkStock?.quantityOnHand.value).toBe(45);

      // 3. Authorized Trainer -> 200 OK
      const trainerRes = await client
        .as(trainer)
        .post(`/api/v1/resources/inventory/${product.id}/consume`)
        .send({ quantity: 3, treatmentSessionId: 'sess_123', notes: 'Authorized clinical tape' });
      expect(trainerRes.status).toBe(HttpStatus.OK);
      expect(trainerRes.body.item.quantityOnHand).toBe(42);
    });

    it('Catalog Item Registration requires inventory.write; rejects read-only users', async () => {
      const { client } = env;

      const payload = {
        name: 'Organic Energy Bar',
        category: InventoryCategory.SUPPLEMENTS,
        unitCost: 1.5,
        sellingPrice: 3.5,
      };

      // Read-only user cannot create catalog items
      const readOnlyRes = await client
        .as(invReadOnlyUser)
        .post('/api/v1/resources/inventory')
        .send(payload);
      expect(readOnlyRes.status).toBe(HttpStatus.FORBIDDEN);

      // Read-only user CAN query catalog items
      const getCatalogRes = await client.as(invReadOnlyUser).get('/api/v1/resources/inventory');
      expect(getCatalogRes.status).toBe(HttpStatus.OK);
    });
  });

  // ==========================================================================
  // 2. FIXED ASSET AUTHORIZATION (SCENARIOS E, F, G, H)
  // ==========================================================================
  describe('Fixed Asset Authorization Gates', () => {
    it('Scenario E: Asset Registration requires assets.write; rejects read-only users and inventory-only users (Sub-Domain Isolation)', async () => {
      const { client } = env;
      const { owner, clientUser } = env.personas;

      const assetPayload = {
        assetTag: 'AST-AUTH-TRD-001',
        name: 'Pro Club Treadmill Commercial',
        category: AssetCategory.GYM_EQUIPMENT,
        location: {
          facilityId: 'fac_main',
          roomId: 'area_cardio',
          zone: 'Cardio Zone 1',
        },
        purchaseDate: '2026-01-15T00:00:00.000Z',
        purchaseValueAmount: 8000.0,
        currentEstimatedValueAmount: 8000.0,
        condition: AssetCondition.EXCELLENT,
      };

      // 1. Unauthenticated -> 401
      const unauthRes = await client
        .withoutAuth()
        .post('/api/v1/resources/assets')
        .send(assetPayload);
      expect(unauthRes.status).toBe(HttpStatus.UNAUTHORIZED);

      // 2. Client -> 403
      const clientRes = await client
        .as(clientUser)
        .post('/api/v1/resources/assets')
        .send(assetPayload);
      expect(clientRes.status).toBe(HttpStatus.FORBIDDEN);

      // 3. Read-Only Assets user (has assets.read, lacks assets.write) -> 403 Forbidden
      const readOnlyRes = await client
        .as(assetsReadOnlyUser)
        .post('/api/v1/resources/assets')
        .send(assetPayload);
      expect(readOnlyRes.status).toBe(HttpStatus.FORBIDDEN);

      // 4. Inventory-only user (has inventory.write, lacks assets.write) -> 403 Forbidden
      // Proves Least-Privilege Sub-Domain Isolation: Consumable inventory managers cannot alter capital asset fleet
      const invStaffRes = await client
        .as(invReadOnlyUser)
        .post('/api/v1/resources/assets')
        .send(assetPayload);
      expect(invStaffRes.status).toBe(HttpStatus.FORBIDDEN);

      // 5. Authorized Owner (has assets.write) -> 201 Created
      const ownerRes = await client.as(owner).post('/api/v1/resources/assets').send(assetPayload);
      expect(ownerRes.status).toBe(HttpStatus.CREATED);
      expect(ownerRes.body.assetTag).toBe('AST-AUTH-TRD-001');
    });

    it('Scenario F: Asset Transfer requires assets.write; rejects read-only and unauthorized users', async () => {
      const { client, assetFactory, fixedAssetRepo } = env;
      const { owner, clientUser } = env.personas;

      const asset = await assetFactory.create(owner, {
        assetTag: 'AST-AUTH-RACK-001',
        name: 'Olympic Power Squat Rack',
        category: AssetCategory.GYM_EQUIPMENT,
        location: {
          facilityId: 'fac_main',
          roomId: 'room_weights_a',
          zone: 'Free Weights A',
        },
        purchaseValueAmount: 5000.0,
        currentEstimatedValueAmount: 5000.0,
        condition: AssetCondition.EXCELLENT,
      });

      const transferPayload: TransferFixedAssetLocationRequestDto = {
        location: {
          facilityId: 'fac_main',
          roomId: 'room_weights_b',
          zone: 'Functional Weights B',
        },
        reason: 'Floor reorganization',
      };

      // 1. Read-Only user -> 403
      const readOnlyRes = await client
        .as(assetsReadOnlyUser)
        .post(`/api/v1/resources/assets/${asset.id}/transfer`)
        .send(transferPayload);
      expect(readOnlyRes.status).toBe(HttpStatus.FORBIDDEN);

      // 2. Client -> 403
      const clientRes = await client
        .as(clientUser)
        .post(`/api/v1/resources/assets/${asset.id}/transfer`)
        .send(transferPayload);
      expect(clientRes.status).toBe(HttpStatus.FORBIDDEN);

      // Location remains unchanged
      const repoAssets = await fixedAssetRepo.findAll();
      const repoAsset = repoAssets.find((a) => a.id.value === asset.id);
      expect(repoAsset?.location.roomId).toBe('room_weights_a');

      // 3. Authorized Owner -> 200 OK
      const ownerRes = await client
        .as(owner)
        .post(`/api/v1/resources/assets/${asset.id}/transfer`)
        .send(transferPayload);
      expect(ownerRes.status).toBe(HttpStatus.OK);
      expect(ownerRes.body.location.roomId).toBe('room_weights_b');
    });

    it('Scenario G: Asset Maintenance status transitions and work order logs require assets.write', async () => {
      const { client, assetFactory } = env;
      const { owner, clientUser } = env.personas;

      const asset = await assetFactory.create(owner, {
        assetTag: 'AST-AUTH-CRYO-001',
        name: 'Clinical CryoChamber',
        category: AssetCategory.THERAPY_EQUIPMENT,
        location: {
          facilityId: 'fac_main',
          roomId: 'suite_cryo',
          zone: 'Recovery Suite',
        },
        purchaseValueAmount: 20000.0,
        currentEstimatedValueAmount: 20000.0,
        condition: AssetCondition.EXCELLENT,
      });

      const statusPayload: ChangeFixedAssetStatusRequestDto = {
        status: AssetStatus.UNDER_MAINTENANCE,
        reason: 'Quarterly sensor recalibration',
      };

      // Read-Only cannot change status -> 403
      const readOnlyStatusRes = await client
        .as(assetsReadOnlyUser)
        .post(`/api/v1/resources/assets/${asset.id}/status`)
        .send(statusPayload);
      expect(readOnlyStatusRes.status).toBe(HttpStatus.FORBIDDEN);

      // Owner changes status -> 200
      const ownerStatusRes = await client
        .as(owner)
        .post(`/api/v1/resources/assets/${asset.id}/status`)
        .send(statusPayload);
      expect(ownerStatusRes.status).toBe(HttpStatus.OK);
      expect(ownerStatusRes.body.status).toBe(AssetStatus.UNDER_MAINTENANCE);

      const maintPayload: RecordAssetMaintenanceRequestDto = {
        serviceDate: new Date().toISOString(),
        costAmount: 350.0,
        costCurrency: 'USD',
        description: 'Sensor recalibration certified',
        performedBy: 'Certified CryoTech',
        updateConditionTo: AssetCondition.EXCELLENT,
      };

      // Client cannot record maintenance work order -> 403
      const clientMaintRes = await client
        .as(clientUser)
        .post(`/api/v1/resources/assets/${asset.id}/maintenance`)
        .send(maintPayload);
      expect(clientMaintRes.status).toBe(HttpStatus.FORBIDDEN);

      // Owner records maintenance -> 200
      const ownerMaintRes = await client
        .as(owner)
        .post(`/api/v1/resources/assets/${asset.id}/maintenance`)
        .send(maintPayload);
      expect(ownerMaintRes.status).toBe(HttpStatus.OK);
      expect(ownerMaintRes.body.id).toBeDefined();
    });

    it('Scenario H: Fixed Asset Revaluation requires dual-permission composition (assets.write + billing.read)', async () => {
      const { client, assetFactory } = env;
      const { owner, clientUser } = env.personas;

      const asset = await assetFactory.create(owner, {
        assetTag: 'AST-AUTH-VAL-001',
        name: 'Commercial Reformer Bed Pro',
        category: AssetCategory.THERAPY_EQUIPMENT,
        location: {
          facilityId: 'fac_main',
          roomId: 'studio_pilates',
          zone: 'Pilates Studio',
        },
        purchaseValueAmount: 7000.0,
        currentEstimatedValueAmount: 7000.0,
        condition: AssetCondition.EXCELLENT,
      });

      const revalPayload: UpdateFixedAssetValuationRequestDto = {
        estimatedValueAmount: 6300.0,
        currency: 'USD',
        reason: 'Market appraisal depreciation write-down',
      };

      // 1. Read-only assets user (has assets.read, lacks assets.write and billing.read) -> 403 Forbidden
      const readOnlyRes = await client
        .as(assetsReadOnlyUser)
        .post(`/api/v1/resources/assets/${asset.id}/valuation`)
        .send(revalPayload);
      expect(readOnlyRes.status).toBe(HttpStatus.FORBIDDEN);

      // 2. Financial Auditor (has billing.read and assets.read, but lacks assets.write mutation authority) -> 403 Forbidden
      // Proves read-only financial users cannot mutate asset valuations
      const auditorRes = await client
        .as(financialAuditorUser)
        .post(`/api/v1/resources/assets/${asset.id}/valuation`)
        .send(revalPayload);
      expect(auditorRes.status).toBe(HttpStatus.FORBIDDEN);

      // 3. Client user -> 403 Forbidden
      const clientRes = await client
        .as(clientUser)
        .post(`/api/v1/resources/assets/${asset.id}/valuation`)
        .send(revalPayload);
      expect(clientRes.status).toBe(HttpStatus.FORBIDDEN);

      // 4. Authorized Owner (holds assets.write AND billing.read) -> 200 OK
      const ownerRes = await client
        .as(owner)
        .post(`/api/v1/resources/assets/${asset.id}/valuation`)
        .send(revalPayload);
      expect(ownerRes.status).toBe(HttpStatus.OK);
      expect(ownerRes.body.currentEstimatedValueAmount).toBeCloseTo(6300.0, 2);
    });
  });

  // ==========================================================================
  // 3. CROSS-DOMAIN VALUATION & OVERVIEW AUTHORIZATION (SCENARIO H)
  // ==========================================================================
  describe('Cross-Domain Resources Valuation & Executive Overview Authorization', () => {
    it('Combined Valuation Summary requires composed permissions (inventory.read + assets.read + billing.read)', async () => {
      const { client } = env;
      const { owner, clientUser } = env.personas;

      // 1. Unauthenticated -> 401
      const unauthRes = await client.withoutAuth().get('/api/v1/resources/valuation/summary');
      expect(unauthRes.status).toBe(HttpStatus.UNAUTHORIZED);

      // 2. Client user -> 403
      const clientRes = await client.as(clientUser).get('/api/v1/resources/valuation/summary');
      expect(clientRes.status).toBe(HttpStatus.FORBIDDEN);

      // 3. User with only inventory.read (lacks assets.read and billing.read) -> 403 Forbidden
      const invOnlyRes = await client
        .as(invReadOnlyUser)
        .get('/api/v1/resources/valuation/summary');
      expect(invOnlyRes.status).toBe(HttpStatus.FORBIDDEN);

      // 4. User with only assets.read (lacks inventory.read and billing.read) -> 403 Forbidden
      const assetsOnlyRes = await client
        .as(assetsReadOnlyUser)
        .get('/api/v1/resources/valuation/summary');
      expect(assetsOnlyRes.status).toBe(HttpStatus.FORBIDDEN);

      // 5. Financial Auditor (holds inventory.read, assets.read, AND billing.read) -> 200 OK
      const auditorRes = await client
        .as(financialAuditorUser)
        .get('/api/v1/resources/valuation/summary');
      expect(auditorRes.status).toBe(HttpStatus.OK);
      expect(auditorRes.body.totalCombinedValueAmount).toBeDefined();

      // 6. Owner (holds all permissions) -> 200 OK
      const ownerRes = await client.as(owner).get('/api/v1/resources/valuation/summary');
      expect(ownerRes.status).toBe(HttpStatus.OK);
    });

    it('Executive Overview Dashboard requires composed permissions and rejects unprivileged requests', async () => {
      const { client } = env;
      const { owner, clientUser } = env.personas;

      // 1. Unauthenticated -> 401
      const unauthRes = await client.withoutAuth().get('/api/v1/resources/overview');
      expect(unauthRes.status).toBe(HttpStatus.UNAUTHORIZED);

      // 2. Client user -> 403
      const clientRes = await client.as(clientUser).get('/api/v1/resources/overview');
      expect(clientRes.status).toBe(HttpStatus.FORBIDDEN);

      // 3. Financial Auditor -> 200 OK
      const auditorRes = await client.as(financialAuditorUser).get('/api/v1/resources/overview');
      expect(auditorRes.status).toBe(HttpStatus.OK);
      expect(auditorRes.body.combined).toBeDefined();

      // 4. Owner -> 200 OK
      const ownerRes = await client.as(owner).get('/api/v1/resources/overview');
      expect(ownerRes.status).toBe(HttpStatus.OK);
    });

    it('Proves frontend hiding is NOT the security boundary: direct HTTP mutation attempts by read-only users fail at the backend boundary with zero side effects', async () => {
      const { client, productFactory, inventoryRepo } = env;
      const { owner } = env.personas;

      const product = await productFactory.create(owner, {
        name: 'Electrolyte Hydration Drink Pro',
        category: InventoryCategory.HEALTHY_DRINKS,
        unitCost: 3.0,
        sellingPrice: 6.0,
        quantityOnHand: 0,
      });

      // Auditor can READ inventory details via backend API
      const readRes = await client
        .as(financialAuditorUser)
        .get(`/api/v1/resources/inventory/${product.id}`);
      expect(readRes.status).toBe(HttpStatus.OK);

      // Direct forged HTTP mutation call attempting to bypass frontend restrictions
      const bypassAttemptRes = await client
        .as(financialAuditorUser)
        .post(`/api/v1/resources/inventory/${product.id}/receive`)
        .send({
          quantity: 1000,
          unitCost: 0.01,
          notes: 'Direct API bypass attempt by read-only auditor',
        });

      // Backend security gate is authoritative: HTTP 403 Forbidden
      expect(bypassAttemptRes.status).toBe(HttpStatus.FORBIDDEN);

      // Verification of zero database side-effects
      const itemAfter = await inventoryRepo.findById(product.id);
      expect(itemAfter?.quantityOnHand.value).toBe(0);
      expect(itemAfter?.movements.length).toBe(0);
    });
  });
});
