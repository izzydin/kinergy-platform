import { INestApplication, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  InventoryCategory,
  StockMovementType,
  AssetCategory,
  AssetStatus,
  AssetCondition,
  AssetHistoryEventType,
  CreateInventoryItemHandler,
  UpdateInventoryItemHandler,
  ArchiveInventoryItemHandler,
  ActivateInventoryItemHandler,
  DeactivateInventoryItemHandler,
  ReceiveStockHandler,
  SellStockHandler,
  ConsumeStockHandler,
  ConsumeStockCommand,
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
import { CreateFixedAssetRequestDto, FixedAssetResponseDto } from '../dto';

describe('Phase 6: Resources Management End-to-End Business Scenarios (A through H)', () => {
  let app: INestApplication;
  let client: TestApiClient;
  let userRepo: InMemoryE2EUserRepository;
  let inventoryRepo: InMemoryInventoryItemRepository;
  let fixedAssetRepo: InMemoryFixedAssetRepository;
  let productFactory: InventoryProductFactory;
  let assetFactory: FixedAssetFactory;
  let sellStockHandler: SellStockHandler;
  let consumeStockHandler: ConsumeStockHandler;

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
    sellStockHandler = new SellStockHandler(inventoryRepo);
    consumeStockHandler = new ConsumeStockHandler(inventoryRepo);
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
    it('Given a persisted consumable inventory item with 50 units, When selling 5 units, Then stock is 45, exactly 1 SALE movement is logged, valuation is recalculated, and unrelated items remain untouched', async () => {
      // Setup Unrelated Product baseline: 10 units @ $3.00 cost = $30.00
      const unrelatedProduct = await productFactory.create(owner, {
        name: 'Unrelated Electrolyte Drink',
        category: InventoryCategory.HEALTHY_DRINKS,
        unitCost: 3.0,
        sellingPrice: 6.0,
        quantityOnHand: 0,
      });
      await client
        .as(owner)
        .post(`/api/v1/resources/inventory/${unrelatedProduct.id}/receive`)
        .send({
          quantity: 10,
          unitCost: 3.0,
          notes: 'Initial stocking of electrolyte drinks',
        });

      // Given: A persisted retail supplement with starting stock of 50 units ($10.00 unit cost, $25.00 retail)
      const product = await productFactory.create(owner, {
        name: 'Organic Plant Protein Powder',
        category: InventoryCategory.SUPPLEMENTS,
        unitCost: 10.0,
        sellingPrice: 25.0,
        quantityOnHand: 0,
      });

      const receiveRes = await client
        .as(owner)
        .post(`/api/v1/resources/inventory/${product.id}/receive`)
        .send({
          quantity: 50,
          unitCost: 10.0,
          notes: 'Initial warehouse stocking of 50 units',
        });
      expect(receiveRes.status).toBe(HttpStatus.OK);
      expect(receiveRes.body.item.quantityOnHand).toBe(50);

      // Verify initial valuation: (10 * $3.00) + (50 * $10.00) = $530.00 across 60 units
      const initialValRes = await client.as(owner).get('/api/v1/resources/inventory/valuation');
      expect(initialValRes.status).toBe(HttpStatus.OK);
      expect(initialValRes.body.totalValueAmount).toBe(530.0);
      expect(initialValRes.body.totalQuantityUnits).toBe(60);
      expect(initialValRes.body.totalDistinctItems).toBe(2);

      // Snapshot unrelated item state prior to sale
      const unrelatedPreSale = await inventoryRepo.findById(unrelatedProduct.id);
      expect(unrelatedPreSale).not.toBeNull();
      const unrelatedVersionPreSale = unrelatedPreSale!.version;
      const unrelatedMovementsPreSale = unrelatedPreSale!.movements.length;

      // When: The Receptionist executes a SALE operation for 5 units at point of sale with reference 'ord_pos_10492'
      const saleRes = await client
        .as(receptionist)
        .post(`/api/v1/resources/inventory/${product.id}/sell`)
        .send({
          quantity: 5,
          unitPrice: 25.0,
          referenceId: 'ord_pos_10492',
          notes: 'Counter POS credit card purchase',
        });

      // Then: Stock on hand is decremented to exactly 45
      expect(saleRes.status).toBe(HttpStatus.OK);
      expect(saleRes.body.item.quantityOnHand).toBe(45);

      // And: Stock level endpoint also confirms stock is exactly 45
      const stockRes = await client
        .as(receptionist)
        .get(`/api/v1/resources/inventory/${product.id}/stock-level`);
      expect(stockRes.status).toBe(HttpStatus.OK);
      expect(stockRes.body.quantityOnHand).toBe(45);

      // And: Movement returned in response is verified
      expect(saleRes.body.movement.movementType).toBe(StockMovementType.SALE);
      expect(saleRes.body.movement.quantityDelta).toBe(-5);
      expect(saleRes.body.movement.balanceAfter).toBe(45);
      expect(saleRes.body.movement.referenceId).toBe('ord_pos_10492');

      // And: Exactly one SALE movement is recorded in the chronological ledger
      const movementsRes = await client
        .as(owner)
        .get(`/api/v1/resources/inventory/${product.id}/movements?movementType=SALE`);
      expect(movementsRes.status).toBe(HttpStatus.OK);
      expect(movementsRes.body.items.length).toBe(1);
      const saleMovement = movementsRes.body.items[0];
      expect(saleMovement.movementType).toBe(StockMovementType.SALE);
      expect(saleMovement.quantityDelta).toBe(-5);
      expect(saleMovement.balanceAfter).toBe(45);
      expect(saleMovement.referenceId).toBe('ord_pos_10492');
      expect(saleMovement.inventoryItemId).toBe(product.id);

      // And: Total movements for the item are 2 (1 RECEIPT of 50, 1 SALE of 5)
      const allMovementsRes = await client
        .as(owner)
        .get(`/api/v1/resources/inventory/${product.id}/movements`);
      expect(allMovementsRes.status).toBe(HttpStatus.OK);
      expect(allMovementsRes.body.items.length).toBe(2);

      // And: Inventory working capital valuation is recalculated according to established rules
      // (10 * $3.00) + (45 * $10.00) = $480.00 across 55 total units
      const postValRes = await client.as(owner).get('/api/v1/resources/inventory/valuation');
      expect(postValRes.status).toBe(HttpStatus.OK);
      expect(postValRes.body.totalValueAmount).toBe(480.0);
      expect(postValRes.body.totalQuantityUnits).toBe(55);
      expect(postValRes.body.totalDistinctItems).toBe(2);

      // And: Unrelated inventory item remains completely unchanged
      const unrelatedPostSale = await inventoryRepo.findById(unrelatedProduct.id);
      expect(unrelatedPostSale).not.toBeNull();
      expect(unrelatedPostSale!.quantityOnHand.value).toBe(10);
      expect(unrelatedPostSale!.version).toBe(unrelatedVersionPreSale);
      expect(unrelatedPostSale!.movements.length).toBe(unrelatedMovementsPreSale);
    });

    it('Proves the SALE operation strictly uses the Inventory bounded context port as the owner of stock mutation (ADR-0106)', async () => {
      // Given: A persisted inventory product with 10 units
      const item = await productFactory.create(owner, {
        name: 'Energy Gel Pack',
        category: InventoryCategory.SUPPLEMENTS,
        unitCost: 2.0,
        sellingPrice: 5.0,
        quantityOnHand: 0,
      });

      await client.as(owner).post(`/api/v1/resources/inventory/${item.id}/receive`).send({
        quantity: 10,
        unitCost: 2.0,
        notes: 'Initial receipt for port testing',
      });

      // When: Sales bounded context invokes InventoryStockDecrementPort directly across bounded context boundary
      const portResult = await sellStockHandler.sellStock({
        itemId: item.id,
        quantity: 3,
        reason: 'Sales order checkout via application port boundary',
        actorId: receptionist.userId,
        referenceId: 'order_ext_99991',
        sellingPrice: { amount: 5.0, currency: 'USD' },
      });

      // Then: The Inventory domain successfully executes the mutation and enforces invariants
      expect(portResult.isSuccess).toBe(true);
      expect(portResult.value.item.quantityOnHand).toBe(7);
      expect(portResult.value.movement.balanceAfter).toBe(7);
      expect(portResult.value.movement.quantityDelta).toBe(-3);
      expect(portResult.value.movement.movementType).toBe(StockMovementType.SALE);

      // And: Over-sale request is rejected by domain invariant without data corruption
      const overSaleResult = await sellStockHandler.sellStock({
        itemId: item.id,
        quantity: 100,
        reason: 'Attempted oversale exceeding current physical stock',
        actorId: receptionist.userId,
        referenceId: 'order_ext_excess',
      });

      expect(overSaleResult.isSuccess).toBe(false);
      expect(overSaleResult.error).toMatch(/insufficient stock/i);

      // And: Stock remains 7
      const recheck = await inventoryRepo.findById(item.id);
      expect(recheck!.quantityOnHand.value).toBe(7);
    });
  });

  // ==========================================================================
  // SCENARIO C: CONSUMPTION (CLINICAL TREATMENT SESSION USAGE)
  // ==========================================================================
  describe('Scenario C: Consumption (Clinical Treatment Session Usage)', () => {
    it('Given a persisted consumable inventory item with 45 units, When consuming 3 units during a treatment session, Then stock is 42, exactly 1 CONSUMPTION movement is logged, no SALE movements exist, valuation is recalculated, and unrelated items remain untouched', async () => {
      // Setup Unrelated Product baseline: 10 units @ $3.00 cost = $30.00
      const unrelatedProduct = await productFactory.create(owner, {
        name: 'Unrelated Electrolyte Drink',
        category: InventoryCategory.HEALTHY_DRINKS,
        unitCost: 3.0,
        sellingPrice: 6.0,
        quantityOnHand: 0,
      });
      await client
        .as(owner)
        .post(`/api/v1/resources/inventory/${unrelatedProduct.id}/receive`)
        .send({
          quantity: 10,
          unitCost: 3.0,
          notes: 'Initial stocking of electrolyte drinks',
        });

      // Given: A persisted clinical supplies product starting with stock of 45 units ($6.00 unit cost, $12.00 retail)
      const product = await productFactory.create(owner, {
        name: 'Elastic Therapeutic Tape Roll',
        category: InventoryCategory.CLINICAL_SUPPLIES,
        unitCost: 6.0,
        sellingPrice: 12.0,
        quantityOnHand: 0,
      });

      const receiveRes = await client
        .as(owner)
        .post(`/api/v1/resources/inventory/${product.id}/receive`)
        .send({
          quantity: 45,
          unitCost: 6.0,
          referenceNumber: 'PO-CLINICAL-45',
          notes: 'Warehouse batch stock receipt of 45 rolls',
        });
      expect(receiveRes.status).toBe(HttpStatus.OK);
      expect(receiveRes.body.item.quantityOnHand).toBe(45);

      // Verify initial valuation: (10 * $3.00) + (45 * $6.00) = $300.00 across 55 units
      const initialValRes = await client.as(owner).get('/api/v1/resources/inventory/valuation');
      expect(initialValRes.status).toBe(HttpStatus.OK);
      expect(initialValRes.body.totalValueAmount).toBe(300.0);
      expect(initialValRes.body.totalQuantityUnits).toBe(55);
      expect(initialValRes.body.totalDistinctItems).toBe(2);

      // Snapshot unrelated item state prior to consumption
      const unrelatedPre = await inventoryRepo.findById(unrelatedProduct.id);
      expect(unrelatedPre).not.toBeNull();
      const unrelatedVersionPre = unrelatedPre!.version;
      const unrelatedMovementsPre = unrelatedPre!.movements.length;

      // When: The Trainer records internal treatment session consumption of 3 units
      const response = await client
        .as(trainer)
        .post(`/api/v1/resources/inventory/${product.id}/consume`)
        .send({
          quantity: 3,
          treatmentSessionId: 'session_kine_881',
          notes: 'Lumbar support taping during therapy',
        });

      // Then: Stock on hand is decremented to exactly 42
      expect(response.status).toBe(HttpStatus.OK);
      expect(response.body.item.quantityOnHand).toBe(42);

      // And: Dedicated stock query confirms stock is exactly 42
      const stockRes = await client
        .as(trainer)
        .get(`/api/v1/resources/inventory/${product.id}/stock-level`);
      expect(stockRes.status).toBe(HttpStatus.OK);
      expect(stockRes.body.quantityOnHand).toBe(42);

      // And: A CONSUMPTION movement exists with correct reference and quantity
      expect(response.body.movement.movementType).toBe(StockMovementType.CONSUMPTION);
      expect(response.body.movement.quantityDelta).toBe(-3);
      expect(response.body.movement.balanceAfter).toBe(42);
      expect(response.body.movement.referenceId).toBe('session_kine_881');
      expect(response.body.movement.inventoryItemId).toBe(product.id);

      // And: Querying the chronological ledger confirms exactly one CONSUMPTION movement
      const consumptionMovementsRes = await client
        .as(owner)
        .get(`/api/v1/resources/inventory/${product.id}/movements?movementType=CONSUMPTION`);
      expect(consumptionMovementsRes.status).toBe(HttpStatus.OK);
      expect(consumptionMovementsRes.body.items.length).toBe(1);
      const consumptionMovement = consumptionMovementsRes.body.items[0];
      expect(consumptionMovement.movementType).toBe(StockMovementType.CONSUMPTION);
      expect(consumptionMovement.quantityDelta).toBe(-3);
      expect(consumptionMovement.balanceAfter).toBe(42);
      expect(consumptionMovement.referenceId).toBe('session_kine_881');
      expect(consumptionMovement.inventoryItemId).toBe(product.id);

      // And: Explicitly verify that NO SALE movement was created (application does not model consumption as a sale)
      const saleMovementsRes = await client
        .as(owner)
        .get(`/api/v1/resources/inventory/${product.id}/movements?movementType=SALE`);
      expect(saleMovementsRes.status).toBe(HttpStatus.OK);
      expect(saleMovementsRes.body.items.length).toBe(0);

      // And: Total movements for the item are 2 (1 RECEIPT of 45, 1 CONSUMPTION of 3)
      const allMovementsRes = await client
        .as(owner)
        .get(`/api/v1/resources/inventory/${product.id}/movements`);
      expect(allMovementsRes.status).toBe(HttpStatus.OK);
      expect(allMovementsRes.body.items.length).toBe(2);

      // And: Working capital valuation is recalculated reflecting the remaining stock:
      // (10 * $3.00) + (42 * $6.00) = $282.00 across 52 total units
      const postValRes = await client.as(owner).get('/api/v1/resources/inventory/valuation');
      expect(postValRes.status).toBe(HttpStatus.OK);
      expect(postValRes.body.totalValueAmount).toBe(282.0);
      expect(postValRes.body.totalQuantityUnits).toBe(52);
      expect(postValRes.body.totalDistinctItems).toBe(2);

      // And: Unrelated inventory item remains completely unchanged
      const unrelatedPost = await inventoryRepo.findById(unrelatedProduct.id);
      expect(unrelatedPost).not.toBeNull();
      expect(unrelatedPost!.quantityOnHand.value).toBe(10);
      expect(unrelatedPost!.version).toBe(unrelatedVersionPre);
      expect(unrelatedPost!.movements.length).toBe(unrelatedMovementsPre);
    });

    it('Explicitly verifies domain distinction between SALE and CONSUMPTION and enforces invariant bounds against over-consumption', async () => {
      // Given: A persisted clinical supplies product with 5 units remaining
      const product = await productFactory.create(owner, {
        name: 'Acupuncture Needles Box',
        category: InventoryCategory.CLINICAL_SUPPLIES,
        unitCost: 15.0,
        sellingPrice: 30.0,
        quantityOnHand: 0,
      });

      await client.as(owner).post(`/api/v1/resources/inventory/${product.id}/receive`).send({
        quantity: 5,
        unitCost: 15.0,
        notes: 'Clinical box receipt',
      });

      // When: Consuming 2 units for clinical procedure
      const consumeRes = await client
        .as(trainer)
        .post(`/api/v1/resources/inventory/${product.id}/consume`)
        .send({
          quantity: 2,
          treatmentSessionId: 'session_acupuncture_01',
          notes: 'Sterile needle usage during dry needling',
        });

      expect(consumeRes.status).toBe(HttpStatus.OK);
      expect(consumeRes.body.item.quantityOnHand).toBe(3);
      expect(consumeRes.body.movement.movementType).toBe(StockMovementType.CONSUMPTION);
      expect(consumeRes.body.movement.quantityDelta).toBe(-2);
      expect(consumeRes.body.movement.balanceAfter).toBe(3);

      // Verify domain distinction: The movement is strictly CONSUMPTION and not SALE
      expect(consumeRes.body.movement.movementType).not.toBe(StockMovementType.SALE);

      // And: Verify direct handler invocation follows the same inventory rules
      const directCommand = new ConsumeStockCommand({
        itemId: product.id,
        quantity: 1,
        referenceId: 'session_acupuncture_02',
        reason: 'Additional single needle usage',
        actorId: trainer.userId,
      });
      const directResult = await consumeStockHandler.execute(directCommand);
      expect(directResult.isSuccess).toBe(true);
      expect(directResult.value.item.quantityOnHand).toBe(2);
      expect(directResult.value.movement.movementType).toBe(StockMovementType.CONSUMPTION);
      expect(directResult.value.movement.balanceAfter).toBe(2);

      // Negative check: Attempting over-consumption exceeding remaining stock (10 > 2) is rejected
      const overConsumeRes = await client
        .as(trainer)
        .post(`/api/v1/resources/inventory/${product.id}/consume`)
        .send({
          quantity: 10,
          treatmentSessionId: 'session_excess',
          notes: 'Excess consumption attempt',
        });

      expect(overConsumeRes.status).toBe(HttpStatus.BAD_REQUEST);
      expect(overConsumeRes.body.message).toMatch(/insufficient stock/i);

      // Stock remains exactly 2 and no phantom movements are created
      const checkRes = await client
        .as(trainer)
        .get(`/api/v1/resources/inventory/${product.id}/stock-level`);
      expect(checkRes.status).toBe(HttpStatus.OK);
      expect(checkRes.body.quantityOnHand).toBe(2);
    });
  });

  // ==========================================================================
  // SCENARIO D: INVALID SALE / ATOMIC FAILURE (NEGATIVE-STOCK & OVER-SALE REJECTION)
  // ==========================================================================
  describe('Scenario D: Invalid Sale / Atomic Failure (Negative-Stock & Over-Sale Rejection)', () => {
    it('Given a persisted product with exactly 2 units, When attempting a sale of 5 units, Then the operation is rejected with HTTP 400, stock remains 2, 0 SALE movements are created, no partial mutations exist, and valuation remains unchanged', async () => {
      // Setup Unrelated Product baseline: 10 units @ $3.00 cost = $30.00
      const unrelatedProduct = await productFactory.create(owner, {
        name: 'Unrelated Electrolyte Drink',
        category: InventoryCategory.HEALTHY_DRINKS,
        unitCost: 3.0,
        sellingPrice: 6.0,
        quantityOnHand: 0,
      });
      await client
        .as(owner)
        .post(`/api/v1/resources/inventory/${unrelatedProduct.id}/receive`)
        .send({
          quantity: 10,
          unitCost: 3.0,
          notes: 'Initial stocking of electrolyte drinks',
        });

      // Given: A persisted retail item with starting stock of exactly 2 units ($2.50 unit cost, $5.00 retail)
      const product = await productFactory.create(owner, {
        name: 'Electrolyte Hydration Drink',
        category: InventoryCategory.HEALTHY_DRINKS,
        unitCost: 2.5,
        sellingPrice: 5.0,
        quantityOnHand: 0,
      });

      const receiveRes = await client
        .as(owner)
        .post(`/api/v1/resources/inventory/${product.id}/receive`)
        .send({
          quantity: 2,
          unitCost: 2.5,
          referenceNumber: 'PO-EXACT-2',
          notes: 'Initial inventory receipt of 2 units',
        });
      expect(receiveRes.status).toBe(HttpStatus.OK);
      expect(receiveRes.body.item.quantityOnHand).toBe(2);

      // Verify baseline stock query confirms exactly 2 units
      const stockPreRes = await client
        .as(owner)
        .get(`/api/v1/resources/inventory/${product.id}/stock-level`);
      expect(stockPreRes.status).toBe(HttpStatus.OK);
      expect(stockPreRes.body.quantityOnHand).toBe(2);

      // Verify initial working capital valuation: (10 * $3.00) + (2 * $2.50) = $35.00 across 12 units
      const initialValRes = await client.as(owner).get('/api/v1/resources/inventory/valuation');
      expect(initialValRes.status).toBe(HttpStatus.OK);
      expect(initialValRes.body.totalValueAmount).toBe(35.0);
      expect(initialValRes.body.totalQuantityUnits).toBe(12);
      expect(initialValRes.body.totalDistinctItems).toBe(2);

      // Snapshot aggregate state before attempted over-sale
      const itemPre = await inventoryRepo.findById(product.id);
      expect(itemPre).not.toBeNull();
      const itemVersionPre = itemPre!.version;
      const itemMovementsPre = itemPre!.movements.length;

      // Snapshot unrelated product state
      const unrelatedPre = await inventoryRepo.findById(unrelatedProduct.id);
      expect(unrelatedPre).not.toBeNull();
      const unrelatedVersionPre = unrelatedPre!.version;
      const unrelatedMovementsPre = unrelatedPre!.movements.length;

      // When: Receptionist attempts to sell 5 units (exceeding available stock of 2)
      const response = await client
        .as(receptionist)
        .post(`/api/v1/resources/inventory/${product.id}/sell`)
        .send({
          quantity: 5,
          unitPrice: 5.0,
          referenceId: 'ord_pos_oversell_attempt',
          notes: 'Customer requesting bulk purchase beyond stock',
        });

      // Then: The operation is rejected with HTTP 400 Bad Request
      expect(response.status).toBe(HttpStatus.BAD_REQUEST);

      // And: The error is the correct domain/application error mapping (Insufficient stock with invariant INV-1)
      expect(response.body.message).toMatch(/insufficient stock/i);
      expect(response.body.message).toMatch(/current stock is 2/i);
      expect(response.body.message).toMatch(/requested reduction is 5/i);
      expect(response.body.message).toMatch(/invariant \[inv-1\] violated/i);

      // And: Physical stock on hand remains unaltered at exactly 2
      const stockPostRes = await client
        .as(owner)
        .get(`/api/v1/resources/inventory/${product.id}/stock-level`);
      expect(stockPostRes.status).toBe(HttpStatus.OK);
      expect(stockPostRes.body.quantityOnHand).toBe(2);

      const itemDetailRes = await client.as(owner).get(`/api/v1/resources/inventory/${product.id}`);
      expect(itemDetailRes.status).toBe(HttpStatus.OK);
      expect(itemDetailRes.body.quantityOnHand).toBe(2);

      // And: No SALE movement is created (ledger has 0 SALE movements)
      const saleMovementsRes = await client
        .as(owner)
        .get(`/api/v1/resources/inventory/${product.id}/movements?movementType=SALE`);
      expect(saleMovementsRes.status).toBe(HttpStatus.OK);
      expect(saleMovementsRes.body.items.length).toBe(0);

      // And: No phantom or invalid movements exist (ledger has only the initial 1 receipt)
      const allMovementsRes = await client
        .as(owner)
        .get(`/api/v1/resources/inventory/${product.id}/movements`);
      expect(allMovementsRes.status).toBe(HttpStatus.OK);
      expect(allMovementsRes.body.items.length).toBe(1);
      expect(allMovementsRes.body.items[0].movementType).toBe(StockMovementType.PURCHASE);

      // And: No partial database mutation exists (OCC version and in-memory entity unchanged)
      const itemPost = await inventoryRepo.findById(product.id);
      expect(itemPost).not.toBeNull();
      expect(itemPost!.quantityOnHand.value).toBe(2);
      expect(itemPost!.version).toBe(itemVersionPre);
      expect(itemPost!.movements.length).toBe(itemMovementsPre);

      // And: Inventory valuation remains strictly unchanged at $35.00 across 12 units
      const postValRes = await client.as(owner).get('/api/v1/resources/inventory/valuation');
      expect(postValRes.status).toBe(HttpStatus.OK);
      expect(postValRes.body.totalValueAmount).toBe(35.0);
      expect(postValRes.body.totalQuantityUnits).toBe(12);
      expect(postValRes.body.totalDistinctItems).toBe(2);

      // And: Unrelated item remains completely unchanged
      const unrelatedPost = await inventoryRepo.findById(unrelatedProduct.id);
      expect(unrelatedPost).not.toBeNull();
      expect(unrelatedPost!.quantityOnHand.value).toBe(10);
      expect(unrelatedPost!.version).toBe(unrelatedVersionPre);
      expect(unrelatedPost!.movements.length).toBe(unrelatedMovementsPre);
    });

    it('Proves concurrency race-condition guarantees: concurrent over-sales cannot drive stock negative or create orphaned movements', async () => {
      // Given: A persisted retail item with starting stock of exactly 2 units
      const item = await productFactory.create(owner, {
        name: 'Single Energy Gel',
        category: InventoryCategory.SUPPLEMENTS,
        unitCost: 1.5,
        sellingPrice: 3.5,
        quantityOnHand: 0,
      });

      await client.as(owner).post(`/api/v1/resources/inventory/${item.id}/receive`).send({
        quantity: 2,
        unitCost: 1.5,
        notes: 'Receipt of 2 energy gels',
      });

      // When: Two concurrent sales requesting 2 units each are dispatched simultaneously
      const [result1, result2] = await Promise.all([
        client.as(receptionist).post(`/api/v1/resources/inventory/${item.id}/sell`).send({
          quantity: 2,
          unitPrice: 3.5,
          referenceId: 'race_order_A',
          notes: 'Concurrent checkout A',
        }),
        client.as(receptionist).post(`/api/v1/resources/inventory/${item.id}/sell`).send({
          quantity: 2,
          unitPrice: 3.5,
          referenceId: 'race_order_B',
          notes: 'Concurrent checkout B',
        }),
      ]);

      // Then: Exactly one must succeed (200 OK) and the other must be rejected with 400 Bad Request
      const statuses = [result1.status, result2.status].sort();
      expect(statuses[0]).toBe(HttpStatus.OK);
      expect([HttpStatus.BAD_REQUEST, HttpStatus.CONFLICT]).toContain(statuses[1]);

      // And: Stock never becomes negative; it must be exactly 0
      const finalStockRes = await client
        .as(owner)
        .get(`/api/v1/resources/inventory/${item.id}/stock-level`);
      expect(finalStockRes.status).toBe(HttpStatus.OK);
      expect(finalStockRes.body.quantityOnHand).toBe(0);

      // And: Exactly one SALE movement is recorded, matching the successful order only
      const saleMovements = await client
        .as(owner)
        .get(`/api/v1/resources/inventory/${item.id}/movements?movementType=SALE`);
      expect(saleMovements.status).toBe(HttpStatus.OK);
      expect(saleMovements.body.items.length).toBe(1);
      expect(saleMovements.body.items[0].quantityDelta).toBe(-2);
      expect(saleMovements.body.items[0].balanceAfter).toBe(0);
    });
  });

  // ==========================================================================
  // SCENARIO E: ASSET REGISTRATION (FIXED ASSET COMMISSIONING)
  // ==========================================================================
  describe('Scenario E: Asset Registration (Fixed Asset Commissioning)', () => {
    it('Given no assets in the fleet, When the Owner registers a treadmill, Then HTTP 201 is returned, identity/values/status/condition are verified, CREATED event is recorded, queries reflect the asset, and valuation summary includes it', async () => {
      // Given: Realistic domain payload representing acquisition of a Kinergy commercial treadmill
      const purchaseValueX = 8500.0;
      const currentEstimatedValueY = 7800.0;

      const treadmillPayload: CreateFixedAssetRequestDto = {
        assetTag: 'AST-TRD-2026-001',
        name: 'Commercial Heavy-Duty Treadmill Pro X',
        description:
          'High-performance commercial running machine with incline control and telemetry',
        category: AssetCategory.GYM_EQUIPMENT,
        purchaseDate: '2026-03-01T08:00:00.000Z',
        purchaseValueAmount: purchaseValueX,
        purchaseValueCurrency: 'USD',
        currentEstimatedValueAmount: currentEstimatedValueY,
        condition: AssetCondition.GOOD,
        status: AssetStatus.ACTIVE,
        location: {
          facilityId: 'fac_main',
          roomId: 'Room 101',
          zone: 'Cardio Zone A',
          description: 'Main Gym Floor Cardio Section',
        },
        notes: 'Acquired from authorized commercial fitness supplier with 3-year warranty',
      };

      // When: Register treadmill using the existing Fixed Asset application API
      const createRes = await client
        .as(owner)
        .post('/api/v1/resources/assets')
        .send(treadmillPayload);

      // Verify: Asset is created with HTTP 201 Created
      expect(createRes.status).toBe(HttpStatus.CREATED);
      const createdAsset: FixedAssetResponseDto = createRes.body;

      // Verify: Asset identity is correct
      expect(createdAsset.id).toBeDefined();
      expect(typeof createdAsset.id).toBe('string');
      expect(createdAsset.assetTag).toBe('AST-TRD-2026-001');
      expect(createdAsset.name).toBe('Commercial Heavy-Duty Treadmill Pro X');
      expect(createdAsset.description).toBe(
        'High-performance commercial running machine with incline control and telemetry',
      );

      // Verify: Category is correct
      expect(createdAsset.category).toBe(AssetCategory.GYM_EQUIPMENT);

      // Verify: Location is correct
      expect(createdAsset.location).toBeDefined();
      expect(createdAsset.location.facilityId).toBe('fac_main');
      expect(createdAsset.location.roomId).toBe('Room 101');
      expect(createdAsset.location.zone).toBe('Cardio Zone A');
      expect(createdAsset.location.description).toBe('Main Gym Floor Cardio Section');

      // Verify: Status is ACTIVE
      expect(createdAsset.status).toBe(AssetStatus.ACTIVE);

      // Verify: Condition is GOOD
      expect(createdAsset.condition).toBe(AssetCondition.GOOD);

      // Verify: Creation history is recorded (immutable audit trail)
      const historyRes = await client
        .as(owner)
        .get(`/api/v1/resources/assets/${createdAsset.id}/history`);
      expect(historyRes.status).toBe(HttpStatus.OK);
      expect(historyRes.body.items.length).toBe(1);
      const createdEvent = historyRes.body.items[0];
      expect(createdEvent.eventType).toBe(AssetHistoryEventType.CREATED);
      expect(createdEvent.assetId).toBe(createdAsset.id);
      expect(createdEvent.recordedByUserId).toBe(owner.userId);
      expect(createdEvent.recordedAt).toBeDefined();
      expect(createdEvent.details).toBeDefined();
      expect(createdEvent.details.assetTag).toBe('AST-TRD-2026-001');
      expect(createdEvent.details.category).toBe(AssetCategory.GYM_EQUIPMENT);

      // Verify: Asset appears in the appropriate resource queries
      // 1. Single asset query by ID
      const byIdRes = await client.as(owner).get(`/api/v1/resources/assets/${createdAsset.id}`);
      expect(byIdRes.status).toBe(HttpStatus.OK);
      expect(byIdRes.body.id).toBe(createdAsset.id);
      expect(byIdRes.body.assetTag).toBe('AST-TRD-2026-001');
      expect(byIdRes.body.category).toBe(AssetCategory.GYM_EQUIPMENT);
      expect(byIdRes.body.status).toBe(AssetStatus.ACTIVE);
      expect(byIdRes.body.condition).toBe(AssetCondition.GOOD);

      // 2. Hardware barcode / RFID tag query
      const byTagRes = await client
        .as(owner)
        .get(`/api/v1/resources/assets/tag/${createdAsset.assetTag}`);
      expect(byTagRes.status).toBe(HttpStatus.OK);
      expect(byTagRes.body.id).toBe(createdAsset.id);
      expect(byTagRes.body.name).toBe('Commercial Heavy-Duty Treadmill Pro X');

      // 3. List query filtered by category (GYM_EQUIPMENT)
      const categoryListRes = await client
        .as(owner)
        .get(`/api/v1/resources/assets?category=${AssetCategory.GYM_EQUIPMENT}`);
      expect(categoryListRes.status).toBe(HttpStatus.OK);
      expect(
        categoryListRes.body.items.some((a: FixedAssetResponseDto) => a.id === createdAsset.id),
      ).toBe(true);

      // 4. List query filtered by status (ACTIVE)
      const statusListRes = await client
        .as(owner)
        .get(`/api/v1/resources/assets?status=${AssetStatus.ACTIVE}`);
      expect(statusListRes.status).toBe(HttpStatus.OK);
      expect(
        statusListRes.body.items.some((a: FixedAssetResponseDto) => a.id === createdAsset.id),
      ).toBe(true);

      // 5. List query filtered by condition (GOOD)
      const conditionListRes = await client
        .as(owner)
        .get(`/api/v1/resources/assets?condition=${AssetCondition.GOOD}`);
      expect(conditionListRes.status).toBe(HttpStatus.OK);
      expect(
        conditionListRes.body.items.some((a: FixedAssetResponseDto) => a.id === createdAsset.id),
      ).toBe(true);

      // Verify: Fixed Asset Value includes the asset according to the established valuation rules
      // 1. Single asset financial valuation endpoint
      const valRes = await client
        .as(owner)
        .get(`/api/v1/resources/assets/${createdAsset.id}/valuation`);
      expect(valRes.status).toBe(HttpStatus.OK);
      expect(valRes.body.purchaseValueAmount).toBe(purchaseValueX);
      expect(valRes.body.currentEstimatedValueAmount).toBe(currentEstimatedValueY);

      // 2. Fixed asset estate valuation summary endpoint
      const summaryRes = await client.as(owner).get('/api/v1/resources/assets/valuation/summary');
      expect(summaryRes.status).toBe(HttpStatus.OK);
      expect(summaryRes.body.totalPurchaseValueAmount).toBe(purchaseValueX);
      expect(summaryRes.body.totalCarryingValueAmount).toBe(currentEstimatedValueY);
      expect(summaryRes.body.totalAssetCount).toBe(1);
      expect(summaryRes.body.activeAssetCount).toBe(1);
      expect(summaryRes.body.breakdownByCategory[AssetCategory.GYM_EQUIPMENT]).toEqual({
        totalCarryingValueAmount: currentEstimatedValueY,
        totalPurchaseValueAmount: purchaseValueX,
        assetCount: 1,
      });
      expect(summaryRes.body.breakdownByCondition[AssetCondition.GOOD]).toEqual({
        totalCarryingValueAmount: currentEstimatedValueY,
        count: 1,
      });
      expect(summaryRes.body.breakdownByStatus[AssetStatus.ACTIVE]).toEqual({
        totalCarryingValueAmount: currentEstimatedValueY,
        count: 1,
      });

      // 3. Combined cross-domain resource valuation summary endpoint
      const combinedValRes = await client.as(owner).get('/api/v1/resources/valuation/summary');
      expect(combinedValRes.status).toBe(HttpStatus.OK);
      expect(combinedValRes.body.fixedAssets.totalCarryingValueAmount).toBe(currentEstimatedValueY);
      expect(combinedValRes.body.fixedAssets.totalPurchaseValueAmount).toBe(purchaseValueX);
      expect(combinedValRes.body.fixedAssets.totalAssetCount).toBe(1);
      expect(combinedValRes.body.fixedAssets.activeAssetCount).toBe(1);
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
