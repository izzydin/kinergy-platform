import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
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
import { InventoryController } from '../../controllers/inventory.controller';
import { FixedAssetsController } from '../../controllers/fixed-assets.controller';
import { ResourceValuationController } from '../../controllers/resource-valuation.controller';
import { ResourceOverviewController } from '../../controllers/resource-overview.controller';
import { GlobalSanitizationValidationPipe } from '../../../common/pipes/global-sanitization-validation.pipe';
import { AuthenticationGuard } from '../../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../../platform/identity/authorization/authorization.guard';
import { DefaultAuthorizationEvaluator } from '../../../platform/identity/authorization/default-authorization-evaluator';
import { DefaultPermissionResolver } from '../../../platform/identity/authorization/default-permission-resolver';
import {
  AUTHORIZATION_EVALUATOR,
  PERMISSION_RESOLVER,
} from '../../../platform/identity/authorization';
import { USER_REPOSITORY } from '../../../platform/identity/domain';
import {
  AccessTokenService,
  ACCESS_TOKEN_SERVICE,
} from '../../../platform/identity/tokens/access-token.service';
import { JwtTokenFactory } from '../../../platform/identity/tokens/jwt-token-factory';
import { ConfigSecretProvider } from '../../../platform/identity/tokens/config-secret-provider';
import { ConfigTokenConfiguration } from '../../../platform/identity/tokens/config-token-configuration';
import { TOKEN_FACTORY } from '../../../platform/identity/tokens/token-factory.interface';
import { TOKEN_CONFIGURATION } from '../../../platform/identity/tokens/token-configuration.interface';
import { SECRET_PROVIDER } from '../../../platform/identity/tokens/secret-provider.interface';
import { TestApiClient } from './api-client';
import {
  createTestOwner,
  createTestReceptionist,
  createTestTrainer,
  createTestClient,
  seedAuthPersonas,
  TestPersona,
  InMemoryE2EUserRepository,
} from './auth-personas';
import {
  InMemoryInventoryItemRepository,
  InMemoryFixedAssetRepository,
} from './in-memory-storage.engine';
import { InventoryProductFactory } from './inventory-product.factory';
import { FixedAssetFactory } from './fixed-asset.factory';

export interface ResourcesE2ETestEnvironment {
  app: INestApplication;
  client: TestApiClient;
  userRepo: InMemoryE2EUserRepository;
  inventoryRepo: InMemoryInventoryItemRepository;
  fixedAssetRepo: InMemoryFixedAssetRepository;
  productFactory: InventoryProductFactory;
  assetFactory: FixedAssetFactory;
  sellStockHandler: SellStockHandler;
  consumeStockHandler: ConsumeStockHandler;
  personas: {
    owner: TestPersona;
    receptionist: TestPersona;
    trainer: TestPersona;
    clientUser: TestPersona;
  };
  reset(): void;
  close(): Promise<void>;
}

export async function createResourcesE2ETestEnvironment(): Promise<ResourcesE2ETestEnvironment> {
  const userRepo = new InMemoryE2EUserRepository();
  const inventoryRepo = new InMemoryInventoryItemRepository();
  const fixedAssetRepo = new InMemoryFixedAssetRepository();

  const owner = createTestOwner();
  const receptionist = createTestReceptionist();
  const trainer = createTestTrainer();
  const clientUser = createTestClient();

  await seedAuthPersonas(userRepo, [owner, receptionist, trainer, clientUser]);

  const testSecret = 'kynergy-dev-jwt-access-secret-minimum-32-chars-long';

  const configServiceMock = {
    get: jest.fn((key: string) => {
      switch (key) {
        case 'JWT_ACCESS_SECRET':
          return testSecret;
        case 'JWT_REFRESH_SECRET':
          return testSecret;
        case 'JWT_ACCESS_EXPIRES_IN':
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
  const getResourceOverviewHandler = new GetResourceOverviewHandler(inventoryRepo, fixedAssetRepo);

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
      {
        provide: UpdateFixedAssetValuationHandler,
        useValue: updateFixedAssetValuationHandler,
      },
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

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(
    new GlobalSanitizationValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  await app.init();

  const client = new TestApiClient(app.getHttpServer());
  const productFactory = new InventoryProductFactory(client);
  const assetFactory = new FixedAssetFactory(client);

  return {
    app,
    client,
    userRepo,
    inventoryRepo,
    fixedAssetRepo,
    productFactory,
    assetFactory,
    sellStockHandler,
    consumeStockHandler,
    personas: {
      owner,
      receptionist,
      trainer,
      clientUser,
    },
    reset: () => {
      inventoryRepo.reset();
      fixedAssetRepo.reset();
    },
    close: async () => {
      await app.close();
    },
  };
}
