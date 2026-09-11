import { INestApplication, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  InventoryCategory,
  StockMovementType,
  AssetCategory,
  AssetStatus,
  AssetCondition,
  CreateInventoryItemHandler,
  UpdateInventoryItemHandler,
  ArchiveInventoryItemHandler,
  ActivateInventoryItemHandler,
  DeactivateInventoryItemHandler,
  ReceiveStockHandler,
  SellStockHandler,
  ConsumeStockHandler,
  ScrapStockHandler,
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
  GetFixedAssetValuationSummaryHandler,
  GetCombinedResourceValuationHandler,
  GetResourceOverviewHandler,
} from '@kinergy-platform/core';
import { InventoryController } from '../controllers/inventory.controller';
import { FixedAssetsController } from '../controllers/fixed-assets.controller';
import { ResourceValuationController } from '../controllers/resource-valuation.controller';
import { ResourceOverviewController } from '../controllers/resource-overview.controller';
import { GlobalSanitizationValidationPipe } from '../../common/pipes/global-sanitization-validation.pipe';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { DefaultAuthorizationEvaluator } from '../../platform/identity/authorization/default-authorization-evaluator';
import { DefaultPermissionResolver } from '../../platform/identity/authorization/default-permission-resolver';
import {
  AUTHORIZATION_EVALUATOR,
  PERMISSION_RESOLVER,
} from '../../platform/identity/authorization';
import { USER_REPOSITORY } from '../../platform/identity/domain';
import {
  AccessTokenService,
  ACCESS_TOKEN_SERVICE,
} from '../../platform/identity/tokens/access-token.service';
import { JwtTokenFactory } from '../../platform/identity/tokens/jwt-token-factory';
import { ConfigSecretProvider } from '../../platform/identity/tokens/config-secret-provider';
import { ConfigTokenConfiguration } from '../../platform/identity/tokens/config-token-configuration';
import { TOKEN_FACTORY } from '../../platform/identity/tokens/token-factory.interface';
import { TOKEN_CONFIGURATION } from '../../platform/identity/tokens/token-configuration.interface';
import { SECRET_PROVIDER } from '../../platform/identity/tokens/secret-provider.interface';
import {
  TestApiClient,
  createTestOwner,
  createTestReceptionist,
  createTestTrainer,
  createTestClient,
  seedAuthPersonas,
  InMemoryE2EUserRepository,
  InMemoryInventoryItemRepository,
  InMemoryFixedAssetRepository,
  InventoryProductFactory,
  FixedAssetFactory,
  assertResourceOverview,
} from './support';

describe('Phase 6: Resources Management End-to-End Business Scenarios (A through H)', () => {
  let app: INestApplication;
  let client: TestApiClient;
  let userRepo: InMemoryE2EUserRepository;
  let inventoryRepo: InMemoryInventoryItemRepository;
  let fixedAssetRepo: InMemoryFixedAssetRepository;
  let productFactory: InventoryProductFactory;
  let assetFactory: FixedAssetFactory;

  const owner = createTestOwner();
  const receptionist = createTestReceptionist();
  const trainer = createTestTrainer();
  const clientUser = createTestClient();

  const testSecret = 'kynergy-dev-jwt-access-secret-minimum-32-chars-long';

  beforeAll(async () => {
    userRepo = new InMemoryE2EUserRepository();
    inventoryRepo = new InMemoryInventoryItemRepository();
    fixedAssetRepo = new InMemoryFixedAssetRepository();

    await seedAuthPersonas(userRepo, [owner, receptionist, trainer, clientUser]);

    const configServiceMock = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'JWT_ACCESS_SECRET':
            return testSecret;
          case 'JWT_REFRESH_SECRET':
            return 'kynergy-dev-jwt-refresh-secret-minimum-32-chars-long';
          case 'JWT_EXPIRES_IN':
            return '15m';
          case 'JWT_REFRESH_EXPIRES_IN':
            return '7d';
          case 'JWT_ISSUER':
            return 'kynergy-identity-service';
          case 'JWT_AUDIENCE':
            return 'kynergy-platform-clients';
          default:
            return undefined;
        }
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const secretProvider = new ConfigSecretProvider(configServiceMock as any);
    const tokenConfig = new ConfigTokenConfiguration(secretProvider);
    const jwtFactory = new JwtTokenFactory(secretProvider);
    const accessTokenService = new AccessTokenService(jwtFactory);

    // Initialize real CQRS command and query handlers wired to our in-memory repositories
    const createInventoryItemHandler = new CreateInventoryItemHandler(inventoryRepo);
    const updateInventoryItemHandler = new UpdateInventoryItemHandler(inventoryRepo);
    const archiveInventoryItemHandler = new ArchiveInventoryItemHandler(inventoryRepo);
    const activateInventoryItemHandler = new ActivateInventoryItemHandler(inventoryRepo);
    const deactivateInventoryItemHandler = new DeactivateInventoryItemHandler(inventoryRepo);
    const receiveStockHandler = new ReceiveStockHandler(inventoryRepo);
    const sellStockHandler = new SellStockHandler(inventoryRepo);
    const consumeStockHandler = new ConsumeStockHandler(inventoryRepo);
    const scrapStockHandler = new ScrapStockHandler(inventoryRepo);
    const adjustStockHandler = new AdjustStockHandler(inventoryRepo);
    const getInventoryItemByIdHandler = new GetInventoryItemByIdHandler(inventoryRepo);
    const listInventoryItemsHandler = new ListInventoryItemsHandler(inventoryRepo);
    const getStockLevelHandler = new GetStockLevelHandler(inventoryRepo);
    const listStockMovementsHandler = new ListStockMovementsHandler(inventoryRepo);
    const getLowStockItemsHandler = new GetLowStockItemsHandler(inventoryRepo);
    const getInventoryValuationHandler = new GetInventoryValuationHandler(inventoryRepo);

    const createFixedAssetHandler = new CreateFixedAssetHandler(fixedAssetRepo);
    const updateFixedAssetDetailsHandler = new UpdateFixedAssetDetailsHandler(fixedAssetRepo);
    const transferFixedAssetLocationHandler = new TransferFixedAssetLocationHandler(fixedAssetRepo);
    const changeFixedAssetStatusHandler = new ChangeFixedAssetStatusHandler(fixedAssetRepo);
    const updateFixedAssetConditionHandler = new UpdateFixedAssetConditionHandler(fixedAssetRepo);
    const recordAssetMaintenanceHandler = new RecordAssetMaintenanceHandler(fixedAssetRepo);
    const updateFixedAssetValuationHandler = new UpdateFixedAssetValuationHandler(fixedAssetRepo);
    const getFixedAssetByIdHandler = new GetFixedAssetByIdHandler(fixedAssetRepo);
    const getFixedAssetByTagHandler = new GetFixedAssetByTagHandler(fixedAssetRepo);
    const listFixedAssetsHandler = new ListFixedAssetsHandler(fixedAssetRepo);
    const getAssetHistoryHandler = new GetAssetHistoryHandler(fixedAssetRepo);
    const getMaintenanceHistoryHandler = new GetMaintenanceHistoryHandler(fixedAssetRepo);
    const getAssetValueHandler = new GetAssetValueHandler(fixedAssetRepo);
    const getFixedAssetValuationSummaryHandler = new GetFixedAssetValuationSummaryHandler(
      fixedAssetRepo,
    );
    const getCombinedResourceValuationHandler = new GetCombinedResourceValuationHandler(
      inventoryRepo,
      fixedAssetRepo,
    );
    const getResourceOverviewHandler = new GetResourceOverviewHandler(
      inventoryRepo,
      fixedAssetRepo,
    );

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [
        InventoryController,
        FixedAssetsController,
        ResourceValuationController,
        ResourceOverviewController,
      ],
      providers: [
        AuthenticationGuard,
        AuthorizationGuard,
        DefaultPermissionResolver,
        { provide: PERMISSION_RESOLVER, useClass: DefaultPermissionResolver },
        DefaultAuthorizationEvaluator,
        { provide: AUTHORIZATION_EVALUATOR, useClass: DefaultAuthorizationEvaluator },
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: ACCESS_TOKEN_SERVICE, useValue: accessTokenService },
        { provide: TOKEN_FACTORY, useValue: jwtFactory },
        { provide: TOKEN_CONFIGURATION, useValue: tokenConfig },
        { provide: SECRET_PROVIDER, useValue: secretProvider },

        // Handlers
        { provide: CreateInventoryItemHandler, useValue: createInventoryItemHandler },
        { provide: UpdateInventoryItemHandler, useValue: updateInventoryItemHandler },
        { provide: ArchiveInventoryItemHandler, useValue: archiveInventoryItemHandler },
        { provide: ActivateInventoryItemHandler, useValue: activateInventoryItemHandler },
        { provide: DeactivateInventoryItemHandler, useValue: deactivateInventoryItemHandler },
        { provide: ReceiveStockHandler, useValue: receiveStockHandler },
        { provide: SellStockHandler, useValue: sellStockHandler },
        { provide: ConsumeStockHandler, useValue: consumeStockHandler },
        { provide: ScrapStockHandler, useValue: scrapStockHandler },
        { provide: AdjustStockHandler, useValue: adjustStockHandler },
        { provide: GetInventoryItemByIdHandler, useValue: getInventoryItemByIdHandler },
        { provide: ListInventoryItemsHandler, useValue: listInventoryItemsHandler },
        { provide: GetStockLevelHandler, useValue: getStockLevelHandler },
        { provide: ListStockMovementsHandler, useValue: listStockMovementsHandler },
        { provide: GetLowStockItemsHandler, useValue: getLowStockItemsHandler },
        { provide: GetInventoryValuationHandler, useValue: getInventoryValuationHandler },

        { provide: CreateFixedAssetHandler, useValue: createFixedAssetHandler },
        { provide: UpdateFixedAssetDetailsHandler, useValue: updateFixedAssetDetailsHandler },
        {
          provide: TransferFixedAssetLocationHandler,
          useValue: transferFixedAssetLocationHandler,
        },
        { provide: ChangeFixedAssetStatusHandler, useValue: changeFixedAssetStatusHandler },
        {
          provide: UpdateFixedAssetConditionHandler,
          useValue: updateFixedAssetConditionHandler,
        },
        { provide: RecordAssetMaintenanceHandler, useValue: recordAssetMaintenanceHandler },
        { provide: UpdateFixedAssetValuationHandler, useValue: updateFixedAssetValuationHandler },
        { provide: GetFixedAssetByIdHandler, useValue: getFixedAssetByIdHandler },
        { provide: GetFixedAssetByTagHandler, useValue: getFixedAssetByTagHandler },
        { provide: ListFixedAssetsHandler, useValue: listFixedAssetsHandler },
        { provide: GetAssetHistoryHandler, useValue: getAssetHistoryHandler },
        { provide: GetMaintenanceHistoryHandler, useValue: getMaintenanceHistoryHandler },
        { provide: GetAssetValueHandler, useValue: getAssetValueHandler },
        {
          provide: GetFixedAssetValuationSummaryHandler,
          useValue: getFixedAssetValuationSummaryHandler,
        },
        {
          provide: GetCombinedResourceValuationHandler,
          useValue: getCombinedResourceValuationHandler,
        },
        { provide: GetResourceOverviewHandler, useValue: getResourceOverviewHandler },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new GlobalSanitizationValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    client = new TestApiClient(app.getHttpServer());
    productFactory = new InventoryProductFactory(client);
    assetFactory = new FixedAssetFactory(client);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    inventoryRepo.reset();
    fixedAssetRepo.reset();
  });

  // ==========================================================================
  // SCENARIO A: PURCHASE (CONSUMABLE INVENTORY STOCK RECEIPT)
  // ==========================================================================
  describe('Scenario A: Purchase (Consumable Stock Receipt)', () => {
    it('Given a Healthy Drink with zero stock and an existing unrelated item, When the Owner purchases 50 units, Then stock is exactly 50, a PURCHASE movement is recorded with full metadata, valuation updates correctly, and unrelated items are unchanged', async () => {
      // Setup Baseline: Provision an unrelated inventory item to verify cross-item isolation
      // (10 units of Protein Bars @ $3.00 = $30.00 working capital)
      const unrelatedProduct = await productFactory.create(owner, {
        name: 'Organic Raw Protein Bar',
        category: InventoryCategory.SUPPLEMENTS,
        unitCost: 3.0,
        sellingPrice: 5.5,
        quantityOnHand: 10,
      });
      expect(unrelatedProduct.quantityOnHand).toBe(10);
      expect(unrelatedProduct.version).toBe(1);

      // Verify initial baseline valuation before Healthy Drink purchase
      const initialValRes = await client.as(owner).get('/api/v1/resources/inventory/valuation');
      expect(initialValRes.status).toBe(HttpStatus.OK);
      expect(initialValRes.body.totalValueAmount).toBe(30.0);
      expect(initialValRes.body.totalQuantityUnits).toBe(10);

      // Given: A newly registered Healthy Drink with exactly 0 initial stock
      const product = await productFactory.create(owner, {
        name: 'Cold-Pressed Green Juice',
        category: InventoryCategory.HEALTHY_DRINKS,
        unitCost: 4.0,
        sellingPrice: 8.5,
        quantityOnHand: 0,
      });

      // Verify: Owner can create a Healthy Drink and initial stock is exactly zero
      expect(product.id).toBeDefined();
      expect(product.category).toBe(InventoryCategory.HEALTHY_DRINKS);
      expect(product.quantityOnHand).toBe(0);
      expect(product.purchaseCostAmount).toBe(4.0);
      expect(product.sellingPriceAmount).toBe(8.5);

      // When: The Owner purchases 50 units via stock receipt (@ $4.00 invoice unit cost)
      const response = await client
        .as(owner)
        .post(`/api/v1/resources/inventory/${product.id}/receive`)
        .send({
          quantity: 50,
          unitCost: 4.0,
          referenceNumber: 'PO-2026-9912',
          notes: 'Vendor delivery invoice INV-9912',
        });

      // Then: Purchase operation accepts 50 units and stock becomes exactly 50
      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.item.id).toBe(product.id);
      expect(response.body.item.quantityOnHand).toBe(50);
      expect(response.body.item.version).toBe(2);

      // And: A PURCHASE movement is persisted with exact quantity, reference, and metadata
      expect(response.body.movement).toBeDefined();
      expect(response.body.movement.movementType).toBe(StockMovementType.PURCHASE);
      expect(response.body.movement.quantityDelta).toBe(50);
      expect(response.body.movement.balanceAfter).toBe(50);
      expect(response.body.movement.unitCostAmount).toBe(4.0);
      expect(response.body.movement.inventoryItemId).toBe(product.id);
      expect(response.body.movement.referenceId).toBe('PO-2026-9912');
      expect(response.body.movement.recordedByUserId).toBe(owner.userId);
      expect(response.body.movement.reason).toBe('Vendor delivery invoice INV-9912');

      // And: Querying the persisted ledger confirms the exact movement record exists
      const movementsRes = await client
        .as(owner)
        .get(`/api/v1/resources/inventory/${product.id}/movements`);
      expect(movementsRes.status).toBe(HttpStatus.OK);
      expect(movementsRes.body.items.length).toBe(1);
      const persistedMovement = movementsRes.body.items[0];
      expect(persistedMovement.id).toBe(response.body.movement.id);
      expect(persistedMovement.movementType).toBe(StockMovementType.PURCHASE);
      expect(persistedMovement.quantityDelta).toBe(50);
      expect(persistedMovement.balanceAfter).toBe(50);
      expect(persistedMovement.unitCostAmount).toBe(4.0);
      expect(persistedMovement.inventoryItemId).toBe(product.id);
      expect(persistedMovement.recordedByUserId).toBe(owner.userId);

      // And: Inventory valuation changes correctly from known fixture inputs
      // Unrelated item: 10 units @ $3.00 = $30.00
      // Purchased drink: 50 units @ $4.00 = $200.00
      // Expected total: $230.00 across 60 units
      const valRes = await client.as(owner).get('/api/v1/resources/inventory/valuation');
      expect(valRes.status).toBe(HttpStatus.OK);
      expect(valRes.body.totalValueAmount).toBe(230.0);
      expect(valRes.body.totalQuantityUnits).toBe(60);
      expect(valRes.body.totalDistinctItems).toBe(2);

      // And: No unrelated inventory item changes
      const reloadedUnrelated = await client
        .as(owner)
        .get(`/api/v1/resources/inventory/${unrelatedProduct.id}`);
      expect(reloadedUnrelated.status).toBe(HttpStatus.OK);
      expect(reloadedUnrelated.body.quantityOnHand).toBe(10);
      expect(reloadedUnrelated.body.version).toBe(1);

      const unrelatedMovements = await client
        .as(owner)
        .get(`/api/v1/resources/inventory/${unrelatedProduct.id}/movements`);
      expect(unrelatedMovements.status).toBe(HttpStatus.OK);
      expect(unrelatedMovements.body.items.length).toBe(1);
      expect(unrelatedMovements.body.items[0].movementType).toBe(StockMovementType.ADJUSTMENT_IN);
      expect(unrelatedMovements.body.items[0].quantityDelta).toBe(10);
      expect(unrelatedMovements.body.items[0].balanceAfter).toBe(10);
    });

    it('Negative Checks: Enforces SKU uniqueness, rejects invalid quantities, and ensures no duplicate movements or silent drops', async () => {
      // Given: A registered Healthy Drink
      const product = await productFactory.create(owner, {
        sku: 'SKU-DRINK-NEG-001',
        name: 'Immunity Citrus Shot',
        category: InventoryCategory.HEALTHY_DRINKS,
        unitCost: 2.5,
        sellingPrice: 5.0,
        quantityOnHand: 0,
      });

      // Negative Check 1: No duplicate inventory item can be created with the same SKU
      const duplicateSkuRes = await client.as(owner).post('/api/v1/resources/inventory').send({
        sku: 'SKU-DRINK-NEG-001',
        name: 'Phantom Duplicate Drink',
        category: InventoryCategory.HEALTHY_DRINKS,
        unitCost: 2.5,
        sellingPrice: 5.0,
        quantityOnHand: 0,
      });
      expect(duplicateSkuRes.status).toBe(HttpStatus.BAD_REQUEST);
      expect(duplicateSkuRes.body.message).toMatch(/already exists/i);

      // Negative Check 2: Purchase rejects zero quantity without modifying stock
      const zeroQtyRes = await client
        .as(owner)
        .post(`/api/v1/resources/inventory/${product.id}/receive`)
        .send({
          quantity: 0,
          unitCost: 2.5,
          notes: 'Zero quantity test',
        });
      expect(zeroQtyRes.status).toBe(HttpStatus.BAD_REQUEST);

      // Negative Check 3: Purchase rejects negative quantity without modifying stock
      const negativeQtyRes = await client
        .as(owner)
        .post(`/api/v1/resources/inventory/${product.id}/receive`)
        .send({
          quantity: -10,
          unitCost: 2.5,
          notes: 'Negative quantity test',
        });
      expect(negativeQtyRes.status).toBe(HttpStatus.BAD_REQUEST);

      // Verify: Stock remains 0 and movements ledger has 0 movements after rejected attempts
      const checkZeroRes = await client.as(owner).get(`/api/v1/resources/inventory/${product.id}`);
      expect(checkZeroRes.body.quantityOnHand).toBe(0);

      const movementsAfterRejections = await client
        .as(owner)
        .get(`/api/v1/resources/inventory/${product.id}/movements`);
      expect(movementsAfterRejections.body.items.length).toBe(0);

      // Negative Check 4: Stock is incremented exactly once per purchase and not duplicated
      const purchase1 = await client
        .as(owner)
        .post(`/api/v1/resources/inventory/${product.id}/receive`)
        .send({
          quantity: 50,
          unitCost: 2.5,
          referenceNumber: 'PO-BATCH-001',
          notes: 'First receipt of 50 units',
        });
      expect(purchase1.status).toBe(HttpStatus.OK);
      expect(purchase1.body.item.quantityOnHand).toBe(50);
      expect(purchase1.body.item.version).toBe(2);

      // Verify exactly 1 movement exists
      const movements1 = await client
        .as(owner)
        .get(`/api/v1/resources/inventory/${product.id}/movements`);
      expect(movements1.body.items.length).toBe(1);

      // Second distinct purchase of 10 units increments stock to 60 and creates exactly 1 additional movement
      const purchase2 = await client
        .as(owner)
        .post(`/api/v1/resources/inventory/${product.id}/receive`)
        .send({
          quantity: 10,
          unitCost: 2.5,
          referenceNumber: 'PO-BATCH-002',
          notes: 'Second receipt of 10 units',
        });
      expect(purchase2.status).toBe(HttpStatus.OK);
      expect(purchase2.body.item.quantityOnHand).toBe(60);
      expect(purchase2.body.item.version).toBe(3);

      const movements2 = await client
        .as(owner)
        .get(`/api/v1/resources/inventory/${product.id}/movements`);
      expect(movements2.body.items.length).toBe(2);
      expect(movements2.body.items[0].quantityDelta).toBe(10);
      expect(movements2.body.items[1].quantityDelta).toBe(50);
    });
  });

  // ==========================================================================
  // SCENARIO B: SALE (RETAIL POINT-OF-SALE CHECKOUT)
  // ==========================================================================
  describe('Scenario B: Sale (Retail Point-of-Sale Checkout)', () => {
    it('Given a Supplement product with 20 units in stock, When the Receptionist sells 5 units, Then stock is 15, a SALE movement exists, and external transaction reference is logged', async () => {
      // Given: A retail supplement with 20 units in stock ($15.00 cost, $35.00 retail)
      const product = await productFactory.create(owner, {
        name: 'Organic Plant Protein Powder',
        category: InventoryCategory.SUPPLEMENTS,
        unitCost: 15.0,
        sellingPrice: 35.0,
        quantityOnHand: 0,
      });

      await client.as(owner).post(`/api/v1/resources/inventory/${product.id}/receive`).send({
        quantity: 20,
        unitCost: 15.0,
        notes: 'Warehouse batch stock receipt',
      });

      // When: The Receptionist sells 5 units at point of sale with reference 'ord_pos_10492'
      const response = await client
        .as(receptionist)
        .post(`/api/v1/resources/inventory/${product.id}/sell`)
        .send({
          quantity: 5,
          unitPrice: 35.0,
          referenceId: 'ord_pos_10492',
          notes: 'Counter POS credit card purchase',
        });

      // Then: Stock on hand is decremented to 15
      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.item.quantityOnHand).toBe(15);

      // And: A SALE movement is recorded with the external order reference
      expect(response.body.movement.movementType).toBe(StockMovementType.SALE);
      expect(response.body.movement.quantityDelta).toBe(-5);
      expect(response.body.movement.balanceAfter).toBe(15);
      expect(response.body.movement.referenceId).toBe('ord_pos_10492');

      // And: Working capital valuation reflects the remaining 15 units ($225.00)
      const valRes = await client.as(owner).get('/api/v1/resources/inventory/valuation');
      expect(valRes.status).toBe(HttpStatus.OK);
      expect(valRes.body.totalValueAmount).toBe(225.0);
    });
  });

  // ==========================================================================
  // SCENARIO C: CONSUMPTION (CLINICAL TREATMENT SESSION USAGE)
  // ==========================================================================
  describe('Scenario C: Consumption (Clinical Treatment Session Usage)', () => {
    it('Given Clinical Supplies with 30 units, When the Trainer consumes 3 units during a treatment session, Then stock is 27 and a CONSUMPTION movement is logged with session ID', async () => {
      // Given: Clinical supplies (e.g. Kinesiology Tape) with 30 units in stock
      const product = await productFactory.create(owner, {
        name: 'Elastic Therapeutic Tape Roll',
        category: InventoryCategory.CLINICAL_SUPPLIES,
        unitCost: 6.0,
        sellingPrice: 12.0,
        quantityOnHand: 0,
      });

      await client.as(owner).post(`/api/v1/resources/inventory/${product.id}/receive`).send({
        quantity: 30,
        unitCost: 6.0,
        notes: 'Bulk medical supply shipment',
      });

      // When: The Trainer records consumption of 3 rolls for treatment session 'session_kine_881'
      const response = await client
        .as(trainer)
        .post(`/api/v1/resources/inventory/${product.id}/consume`)
        .send({
          quantity: 3,
          treatmentSessionId: 'session_kine_881',
          notes: 'Lumbar support taping during therapy',
        });

      // Then: Stock decreases to 27
      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.item.quantityOnHand).toBe(27);

      // And: A CONSUMPTION movement exists with the treatmentSessionId
      expect(response.body.movement.movementType).toBe(StockMovementType.CONSUMPTION);
      expect(response.body.movement.quantityDelta).toBe(-3);
      expect(response.body.movement.balanceAfter).toBe(27);
      expect(response.body.movement.referenceId).toBe('session_kine_881');
    });
  });

  // ==========================================================================
  // SCENARIO D: INVALID SALE (NEGATIVE-STOCK & OVER-SALE REJECTION)
  // ==========================================================================
  describe('Scenario D: Invalid Sale (Negative-Stock & Over-Sale Rejection)', () => {
    it('Given a product with 10 units in stock, When an attempt is made to sell 15 units, Then the request is rejected with HTTP 400, stock remains 10, and no phantom movement is created', async () => {
      // Given: An item with exactly 10 units in stock
      const product = await productFactory.create(owner, {
        name: 'Electrolyte Hydration Drink',
        category: InventoryCategory.HEALTHY_DRINKS,
        unitCost: 2.5,
        sellingPrice: 5.0,
        quantityOnHand: 0,
      });

      await client.as(owner).post(`/api/v1/resources/inventory/${product.id}/receive`).send({
        quantity: 10,
        unitCost: 2.5,
        notes: 'Initial inventory receipt',
      });

      // When: A sale of 15 units is requested (exceeding stock of 10)
      const response = await client
        .as(receptionist)
        .post(`/api/v1/resources/inventory/${product.id}/sell`)
        .send({
          quantity: 15,
          unitPrice: 5.0,
          referenceId: 'ord_oversell_attempt',
          notes: 'Customer requesting bulk purchase',
        });

      // Then: The request is cleanly rejected with HTTP 400 Bad Request
      expect(response.status).toBe(HttpStatus.BAD_REQUEST);
      expect(response.body.message).toMatch(/insufficient stock/i);

      // And: Physical stock on hand remains unaltered at exactly 10
      const stockRes = await client
        .as(owner)
        .get(`/api/v1/resources/inventory/${product.id}/stock-level`);
      expect(stockRes.status).toBe(HttpStatus.OK);
      expect(stockRes.body.quantityOnHand).toBe(10);

      // And: No phantom movement was appended (ledger has only the initial 1 receipt)
      const movementsRes = await client
        .as(owner)
        .get(`/api/v1/resources/inventory/${product.id}/movements`);
      expect(movementsRes.status).toBe(HttpStatus.OK);
      expect(movementsRes.body.items.length).toBe(1);
      expect(movementsRes.body.items[0].movementType).toBe(StockMovementType.PURCHASE);
    });
  });

  // ==========================================================================
  // SCENARIO E: ASSET REGISTRATION (FIXED ASSET COMMISSIONING)
  // ==========================================================================
  describe('Scenario E: Asset Registration (Fixed Asset Commissioning)', () => {
    it('Given no assets in the fleet, When the Owner registers an Ultrasound Therapy Unit, Then HTTP 201 is returned, status is ACTIVE, and a CREATED event is recorded', async () => {
      // When: The Owner commissions a new Therapy Ultrasound unit ($12,000)
      const asset = await assetFactory.create(owner, {
        assetTag: 'AST-ULTRA-2026-001',
        name: 'Therapeutic Ultrasound Generator Unit',
        category: AssetCategory.THERAPY_EQUIPMENT,
        purchaseValueAmount: 12000.0,
        currentEstimatedValueAmount: 12000.0,
        condition: AssetCondition.EXCELLENT,
        location: {
          facilityId: 'fac_main',
          roomId: 'Room_101',
          zone: 'Physical Therapy Suite',
          description: 'Stationary therapy cart',
        },
      });

      // Then: The asset is created with status ACTIVE
      expect(asset.id).toBeDefined();
      expect(asset.assetTag).toBe('AST-ULTRA-2026-001');
      expect(asset.status).toBe(AssetStatus.ACTIVE);

      // And: Financial valuation is accessible via the restricted valuation endpoint
      const valRes = await client.as(owner).get(`/api/v1/resources/assets/${asset.id}/valuation`);
      expect(valRes.status).toBe(HttpStatus.OK);
      expect(valRes.body.currentEstimatedValueAmount).toBe(12000.0);

      // And: The initial CREATED event is present in the audit history
      const historyRes = await client.as(owner).get(`/api/v1/resources/assets/${asset.id}/history`);
      expect(historyRes.status).toBe(HttpStatus.OK);
      expect(historyRes.body.items.length).toBe(1);
      expect(historyRes.body.items[0].eventType).toBe('CREATED');
    });
  });

  // ==========================================================================
  // SCENARIO F: ASSET TRANSFER (PHYSICAL LOCATION RELOCATION)
  // ==========================================================================
  describe('Scenario F: Asset Transfer (Physical Location Relocation)', () => {
    it('Given an asset located in Room 101, When the Owner transfers it to Room 204, Then the location updates and a TRANSFERRED event is logged', async () => {
      // Given: An active asset commissioned in Room 101
      const asset = await assetFactory.create(owner, {
        assetTag: 'AST-REFORM-001',
        name: 'Pilates Clinical Reformer',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseValueAmount: 6500.0,
        location: {
          facilityId: 'fac_main',
          roomId: 'Room_101',
          zone: 'Consultation Room',
        },
      });

      // When: The Owner relocates the equipment to Room 204 (Rehab Gym)
      const response = await client
        .as(owner)
        .post(`/api/v1/resources/assets/${asset.id}/transfer`)
        .send({
          location: {
            facilityId: 'fac_main',
            roomId: 'Room_204',
            zone: 'Rehabilitation Gymnasium',
            description: 'Bay 3 by the window',
          },
        });

      // Then: The location reflects Room 204
      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.location.roomId).toBe('Room_204');
      expect(response.body.location.zone).toBe('Rehabilitation Gymnasium');

      // And: A TRANSFERRED event is appended to the audit history
      const historyRes = await client.as(owner).get(`/api/v1/resources/assets/${asset.id}/history`);
      expect(historyRes.status).toBe(HttpStatus.OK);
      expect(historyRes.body.items[0].eventType).toBe('TRANSFERRED');
    });
  });

  // ==========================================================================
  // SCENARIO G: ASSET MAINTENANCE (SERVICING & WORK ORDER LOGGING)
  // ==========================================================================
  describe('Scenario G: Maintenance (Servicing & Work Order Logging)', () => {
    it('Given an operational asset, When scheduled calibration is recorded, Then a maintenance record is persisted and a MAINTENANCE_RECORDED event is logged', async () => {
      // Given: An operational Class IV laser equipment asset
      const asset = await assetFactory.create(owner, {
        assetTag: 'AST-LASER-2026-004',
        name: 'Class IV High-Power Laser',
        category: AssetCategory.THERAPY_EQUIPMENT,
        purchaseValueAmount: 18000.0,
      });

      // When: The Owner logs a formal maintenance record
      const response = await client
        .as(owner)
        .post(`/api/v1/resources/assets/${asset.id}/maintenance`)
        .send({
          serviceDate: '2026-06-15T10:00:00.000Z',
          description: 'Semi-annual diode calibration and optical safety inspection',
          costAmount: 450.0,
          costCurrency: 'USD',
          performedBy: 'Apex Laser Biomedical Technicians',
          notes: 'Passed all focal tests; certificate issue #8841',
        });

      // Then: The maintenance endpoint returns HTTP 200 with persisted record
      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.description).toContain('diode calibration');
      expect(response.body.costAmount).toBe(450.0);
      expect(response.body.performedBy).toBe('Apex Laser Biomedical Technicians');

      // And: A MAINTENANCE_RECORDED event is recorded in the asset audit stream
      const historyRes = await client.as(owner).get(`/api/v1/resources/assets/${asset.id}/history`);
      expect(historyRes.status).toBe(HttpStatus.OK);
      expect(historyRes.body.items[0].eventType).toBe('MAINTENANCE_RECORDED');

      // And: Maintenance history ledger lists the work order
      const maintenanceRes = await client
        .as(owner)
        .get(`/api/v1/resources/assets/${asset.id}/maintenance`);
      expect(maintenanceRes.status).toBe(HttpStatus.OK);
      expect(maintenanceRes.body.items.length).toBe(1);
      expect(maintenanceRes.body.items[0].costAmount).toBe(450.0);
    });
  });

  // ==========================================================================
  // SCENARIO H: VALUATION (MULTI-DOMAIN BALANCE SHEET SYNTHESIS)
  // ==========================================================================
  describe('Scenario H: Valuation (Multi-Domain Balance Sheet Synthesis)', () => {
    it('Given 50 units of drinks ($200.00) and a capital asset ($12,000.00), When the Owner queries the overview dashboard, Then Combined Resource Value reflects $12,200.00', async () => {
      // Given: 50 units of green juice ($4.00 unit cost = $200.00 inventory value)
      const juice = await productFactory.create(owner, {
        name: 'Cold-Pressed Juice',
        category: InventoryCategory.HEALTHY_DRINKS,
        unitCost: 4.0,
        sellingPrice: 8.0,
      });

      await client.as(owner).post(`/api/v1/resources/inventory/${juice.id}/receive`).send({
        quantity: 50,
        unitCost: 4.0,
        notes: 'Batch shipment',
      });

      // And: An active capital asset with carrying value of $12,000.00
      await assetFactory.create(owner, {
        assetTag: 'AST-CRYO-001',
        name: 'Whole Body Cryotherapy Chamber',
        category: AssetCategory.THERAPY_EQUIPMENT,
        purchaseValueAmount: 12000.0,
        currentEstimatedValueAmount: 12000.0,
        condition: AssetCondition.EXCELLENT,
      });

      // When: The Owner queries the executive overview dashboard
      const response = await client.as(owner).get('/api/v1/resources/overview');

      // Then: HTTP 200 OK is returned
      expect(response.status).toBe(HttpStatus.OK);

      // And: Working capital inventory valuation is exactly $200.00
      // And: Fixed asset carrying valuation is exactly $12,000.00
      // And: Combined Resource Value is exactly $12,200.00
      assertResourceOverview(response.body, {
        inventoryTotal: 200.0,
        inventoryQuantity: 50,
        assetsCarryingTotal: 12000.0,
        activeAssetCount: 1,
        totalAssetCount: 1,
        combinedTotal: 12200.0,
      });
    });
  });

  // ==========================================================================
  // NEGATIVE AUTHORIZATION & DEFENSE-IN-DEPTH GATES
  // ==========================================================================
  describe('Authorization Negative Security Gates', () => {
    it('rejects unauthenticated requests with HTTP 401 Unauthorized', async () => {
      const response = await client.withoutAuth().get('/api/v1/resources/overview');
      expect(response.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('rejects unprivileged client users attempting stock receipts with HTTP 403 Forbidden', async () => {
      const product = await productFactory.create(owner, {
        name: 'Restricted Item',
        category: InventoryCategory.CLINICAL_SUPPLIES,
        unitCost: 10.0,
        sellingPrice: 20.0,
      });

      const response = await client
        .as(clientUser)
        .post(`/api/v1/resources/inventory/${product.id}/receive`)
        .send({
          quantity: 10,
          notes: 'Unauthorized client attempt',
        });

      expect(response.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('rejects unprivileged client users attempting asset transfers with HTTP 403 Forbidden', async () => {
      const asset = await assetFactory.create(owner, {
        assetTag: 'AST-LOCKED-01',
        name: 'Clinical Exam Table',
      });

      const response = await client
        .as(clientUser)
        .post(`/api/v1/resources/assets/${asset.id}/transfer`)
        .send({
          newLocation: { facilityId: 'fac_unauthorized' },
          reason: 'Client attempted relocation',
        });

      expect(response.status).toBe(HttpStatus.FORBIDDEN);
    });
  });
});
