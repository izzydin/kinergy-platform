import * as fs from 'fs';
import * as path from 'path';

import {
  CreateSaleHandler,
  AddSaleItemHandler,
  RemoveSaleItemHandler,
  ApplyDiscountHandler,
  CalculateSaleHandler,
  GetSaleHandler,
  ListSalesHandler,
  CancelSaleHandler,
} from '..';
import {
  CreateSaleCommand,
  CreateSaleInput,
  AddSaleItemCommand,
  AddSaleItemInput,
  RemoveSaleItemCommand,
  ApplyDiscountCommand,
  CancelSaleCommand,
  CancelSaleInput,
} from '../commands';
import { CalculateSaleQuery, CalculateSaleInput, GetSaleQuery, ListSalesQuery } from '../queries';
import {
  SaleRepositoryPort,
  SalesEventPublisherPort,
  SaleSourceValidatorPort,
  ClientFacadePort,
  FindSalesCriteria,
  FindSalesPagination,
  FindSalesSort,
  FindSalesResult,
} from '../ports';
import { SaleNotFoundException } from '../exceptions';
import {
  DuplicateSaleException,
  InvalidDiscountException,
  InvalidMoneyException,
  SaleAlreadyFinalizedException,
} from '../../domain/exceptions';
import { Sale } from '../../domain/sale.aggregate';
import { SaleSourceType } from '../../domain/enums/sale-source-type.enum';
import { SourceType } from '../../domain/enums/source-type.enum';
import { DiscountType } from '../../domain/enums/discount-type.enum';
import { DeterministicClock } from '../../domain/shared/clock';
import { DomainEvent } from '../../domain/shared/domain-event';
import { SalesApplicationResult } from '../shared/sales-application-result';
import { SaleDTO } from '../dtos/sale.dto';
import { SaleTotalsDTO } from '../dtos/sale-totals.dto';
import { MoneyMapper } from '../mappers/money.mapper';

/**
 * In-memory Mock Repository for application layer isolation verification.
 * Implements SaleRepositoryPort without database or ORM dependencies.
 */
class InMemorySaleRepository implements SaleRepositoryPort {
  public sales = new Map<string, Sale>();

  async findById(id: string): Promise<Sale | null> {
    const sale = this.sales.get(id);
    return sale ?? null;
  }

  async findBySourceReference(
    sourceType: string,
    sourceId: string,
    tenantId?: string,
  ): Promise<Sale | null> {
    for (const sale of this.sales.values()) {
      if (tenantId && sale.tenantId !== tenantId) continue;
      if (sale.status === 'CANCELLED') continue;
      if (sale.source.sourceType === sourceType && sale.source.sourceId === sourceId) {
        return sale;
      }
    }
    return null;
  }

  async findBySourceCode(sourceCode: string, tenantId?: string): Promise<Sale | null> {
    for (const sale of this.sales.values()) {
      if (tenantId && sale.tenantId !== tenantId) continue;
      if (sale.status === 'CANCELLED') continue;
      if (sale.source.sourceCode === sourceCode) {
        return sale;
      }
    }
    return null;
  }

  async findMany(
    criteria: FindSalesCriteria,
    pagination: FindSalesPagination,
    _sort: FindSalesSort,
  ): Promise<FindSalesResult> {
    let matches = Array.from(this.sales.values());
    if (criteria.tenantId) matches = matches.filter((s) => s.tenantId === criteria.tenantId);
    if (criteria.clientId) matches = matches.filter((s) => s.clientId === criteria.clientId);
    if (criteria.status) matches = matches.filter((s) => s.status === criteria.status);

    const offset = (pagination.page - 1) * pagination.limit;
    const items = matches.slice(offset, offset + pagination.limit).map((s) => ({
      id: s.id.value,
      tenantId: s.tenantId,
      clientId: s.clientId,
      currency: s.currency,
      status: s.status,
      source: {
        sourceType: s.source.sourceType,
        sourceId: s.source.sourceId,
        sourceCode: s.source.sourceCode ?? null,
        type: s.source.sourceType,
        referenceId: s.source.sourceId,
        referenceCode: s.source.sourceCode ?? null,
      },
      subtotal: MoneyMapper.toDTO(s.subtotal),
      discountTotal: MoneyMapper.toDTO(s.discountTotal),
      total: MoneyMapper.toDTO(s.total),
      subtotalAmount: s.subtotal.amount,
      discountTotalAmount: s.discountTotal.amount,
      totalAmount: s.total.amount,
      itemCount: s.items.length,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    }));

    return {
      items,
      total: matches.length,
    };
  }

  async list(
    criteria: FindSalesCriteria,
    pagination: FindSalesPagination,
    sort: FindSalesSort,
  ): Promise<FindSalesResult> {
    return this.findMany(criteria, pagination, sort);
  }

  async save(sale: Sale): Promise<void> {
    this.sales.set(sale.id.value, sale);
  }

  async withTransaction<T>(work: (repo: SaleRepositoryPort) => Promise<T>): Promise<T> {
    return work(this);
  }
}

class MockEventPublisher implements SalesEventPublisherPort {
  public published: DomainEvent[] = [];
  async publish(events: ReadonlyArray<DomainEvent>): Promise<void> {
    this.published.push(...events);
  }
}

class MockSourceValidator implements SaleSourceValidatorPort {
  async validateSource() {
    return { isValid: true, exists: true };
  }
}

class MockClientFacade implements ClientFacadePort {
  async getClientSummary(clientId: string) {
    return { id: clientId, fullName: 'Jordan Athlete', email: 'jordan@kinergy.io' };
  }
}

describe('Sale Application Layer: Controller & Multi-Transport Readiness', () => {
  let repository: InMemorySaleRepository;
  let clock: DeterministicClock;
  let publisher: MockEventPublisher;
  let validator: MockSourceValidator;
  let clientFacade: MockClientFacade;

  // Use-case handlers
  let createSaleHandler: CreateSaleHandler;
  let addSaleItemHandler: AddSaleItemHandler;
  let removeSaleItemHandler: RemoveSaleItemHandler;
  let applyDiscountHandler: ApplyDiscountHandler;
  let calculateSaleHandler: CalculateSaleHandler;
  let getSaleHandler: GetSaleHandler;
  let listSalesHandler: ListSalesHandler;
  let cancelSaleHandler: CancelSaleHandler;

  beforeEach(() => {
    repository = new InMemorySaleRepository();
    clock = new DeterministicClock(new Date('2026-10-06T15:00:00.000Z'));
    publisher = new MockEventPublisher();
    validator = new MockSourceValidator();
    clientFacade = new MockClientFacade();

    createSaleHandler = new CreateSaleHandler(
      repository,
      clock,
      publisher,
      validator,
      clientFacade,
    );
    addSaleItemHandler = new AddSaleItemHandler(repository, clock, publisher);
    removeSaleItemHandler = new RemoveSaleItemHandler(repository, clock, publisher);
    applyDiscountHandler = new ApplyDiscountHandler(repository, clock, publisher);
    calculateSaleHandler = new CalculateSaleHandler(repository);
    getSaleHandler = new GetSaleHandler(repository);
    listSalesHandler = new ListSalesHandler(repository);
    cancelSaleHandler = new CancelSaleHandler(repository, clock, publisher);
  });

  // ===========================================================================
  // 1. Multi-Caller Transport Agnosticism
  // ===========================================================================
  describe('Multi-Caller Transport Agnosticism (HTTP, Background Job, CLI, Messaging)', () => {
    it('executes identically from an HTTP Controller context (POJO JSON payload from Express/Fastify)', async () => {
      // Simulating NestJS/Express controller body parsing: pure POJO
      const httpPayload: CreateSaleInput = {
        tenantId: 'tenant_fitness_01',
        clientId: 'client_77',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.DRINK,
          sourceId: 'pos_terminal_01',
        },
        items: [
          {
            description: 'Protein Shake',
            quantity: 2,
            unitPriceAmount: 7.5,
          },
        ],
      };

      const result: SalesApplicationResult<SaleDTO> = await createSaleHandler.execute(
        new CreateSaleCommand(httpPayload),
      );

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.subtotal.amount).toBe(15.0);
      expect(dto.total.amount).toBe(15.0);
      expect(dto.items).toHaveLength(1);
    });

    it('executes identically from a Background Cron Job (e.g. BullMQ worker expiring inactive sales)', async () => {
      // Step 1: Create sale
      const createRes = await createSaleHandler.execute(
        new CreateSaleCommand({
          tenantId: 'tenant_fitness_01',
          currency: 'USD',
          source: { sourceType: SaleSourceType.FOOD, sourceId: 'kiosk_99' },
          items: [{ description: 'Salad', quantity: 1, unitPriceAmount: 12.0 }],
        }),
      );
      const saleId = createRes.getValue().id;

      // Step 2: Background worker job payload without any HTTP Request/Response
      const cronWorkerPayload: CancelSaleInput = {
        saleId,
        reason: 'Automated background cancellation: checkout expired after 24h idle',
      };

      const cancelRes: SalesApplicationResult<SaleDTO> = await cancelSaleHandler.execute(
        new CancelSaleCommand(cronWorkerPayload),
      );

      expect(cancelRes.isSuccess).toBe(true);
      expect(cancelRes.getValue().status).toBe('CANCELLED');
      expect(cancelRes.getValue().cancellationReason).toContain('Automated background');
    });

    it('executes identically from a CLI command runner (e.g. admin diagnostic or seeding script)', async () => {
      // CLI parses args: --tenant tenant_cli --currency EUR --item Pass
      const createRes = await createSaleHandler.execute(
        new CreateSaleCommand({
          tenantId: 'tenant_cli',
          currency: 'EUR',
          source: { sourceType: SaleSourceType.ROOM_RENTAL, sourceId: 'cli_batch_01' },
          items: [{ description: 'Bench Pass', quantity: 1, unitPriceAmount: 50.0 }],
        }),
      );
      const saleId = createRes.getValue().id;

      // CLI query without HTTP context
      const cliCalcPayload: CalculateSaleInput = { saleId };
      const calcRes: SalesApplicationResult<SaleTotalsDTO> = await calculateSaleHandler.execute(
        new CalculateSaleQuery(cliCalcPayload),
      );

      expect(calcRes.isSuccess).toBe(true);
      expect(calcRes.getValue().total.amount).toBe(50.0);
      expect(calcRes.getValue().currency).toBe('EUR');
    });

    it('executes identically from an Asynchronous Event / Messaging Consumer (e.g. Kafka/RabbitMQ)', async () => {
      // Step 1: Initialize sale
      const createRes = await createSaleHandler.execute(
        new CreateSaleCommand({
          tenantId: 'tenant_msg_01',
          currency: 'USD',
          source: { sourceType: SaleSourceType.FOOD, sourceId: 'terminal_2' },
          items: [{ description: 'Base Session', quantity: 1, unitPriceAmount: 40.0 }],
        }),
      );
      const saleId = createRes.getValue().id;

      // Step 2: Incoming message event: Add accessory line item
      const messagePayload: AddSaleItemInput = {
        saleId,
        description: 'Towel Service',
        quantity: 1,
        unitPriceAmount: 5.0,
      };

      const addRes: SalesApplicationResult<SaleDTO> = await addSaleItemHandler.execute(
        new AddSaleItemCommand(messagePayload),
      );

      expect(addRes.isSuccess).toBe(true);
      expect(addRes.getValue().total.amount).toBe(45.0);
      expect(addRes.getValue().items).toHaveLength(2);
    });

    it('executes RemoveSaleItem and ListSales without HTTP infrastructure dependencies', async () => {
      const createRes = await createSaleHandler.execute(
        new CreateSaleCommand({
          tenantId: 'tenant_ops',
          currency: 'USD',
          source: { sourceType: SaleSourceType.FOOD, sourceId: 'cafe_1' },
          items: [
            { description: 'Item A', quantity: 1, unitPriceAmount: 10.0 },
            { description: 'Item B', quantity: 1, unitPriceAmount: 20.0 },
          ],
        }),
      );
      const saleId = createRes.getValue().id;
      const itemIdToRemove = createRes.getValue().items[0]!.id;

      const removeRes = await removeSaleItemHandler.execute(
        new RemoveSaleItemCommand({ saleId, itemId: itemIdToRemove }),
      );
      expect(removeRes.isSuccess).toBe(true);
      expect(removeRes.getValue().items).toHaveLength(1);

      const listRes = await listSalesHandler.execute(
        new ListSalesQuery({ tenantId: 'tenant_ops' }),
      );
      expect(listRes.isSuccess).toBe(true);
      expect(listRes.getValue().total).toBe(1);
    });
  });

  // ===========================================================================
  // 2. Framework & Protocol Independence Guarantees
  // ===========================================================================
  describe('Framework & Protocol Independence Guarantees', () => {
    it('does not accept or require HTTP Request, Response, or NestJS ExecutionContext objects', () => {
      // Inspect command constructors: each accepts strictly its input POJO
      const createCmd = new CreateSaleCommand({
        currency: 'USD',
        source: { sourceType: SaleSourceType.DRINK, sourceId: 't1' },
      });
      const addCmd = new AddSaleItemCommand({
        saleId: 's1',
        description: 'Drink',
        quantity: 1,
        unitPriceAmount: 3,
      });
      const removeCmd = new RemoveSaleItemCommand({ saleId: 's1', itemId: 'i1' });
      const applyCmd = new ApplyDiscountCommand({
        saleId: 's1',
        discount: { type: DiscountType.PERCENTAGE, value: 10 },
      });
      const cancelCmd = new CancelSaleCommand({ saleId: 's1', reason: 'Customer changed mind' });
      const getQuery = new GetSaleQuery({ saleId: 's1' });
      const calcQuery = new CalculateSaleQuery({ saleId: 's1' });
      const listQuery = new ListSalesQuery({ tenantId: 't1' });

      // Verifying input object properties are pure domain/application parameters
      expect(createCmd.input).toBeDefined();
      expect(addCmd.input).toBeDefined();
      expect(removeCmd.input).toBeDefined();
      expect(applyCmd.input).toBeDefined();
      expect(cancelCmd.input).toBeDefined();
      expect(getQuery.input).toBeDefined();
      expect(calcQuery.input).toBeDefined();
      expect(listQuery.input).toBeDefined();

      // No HTTP properties exist
      expect((createCmd as unknown as { request: unknown }).request).toBeUndefined();
      expect((createCmd as unknown as { response: unknown }).response).toBeUndefined();
      expect((createCmd as unknown as { headers: unknown }).headers).toBeUndefined();
    });

    it('returns pure DTOs wrapped in SalesApplicationResult without HTTP status codes or envelopes', async () => {
      const createRes = await createSaleHandler.execute(
        new CreateSaleCommand({
          currency: 'USD',
          source: { sourceType: SaleSourceType.DRINK, sourceId: 't1' },
          items: [{ description: 'Water', quantity: 1, unitPriceAmount: 2.0 }],
        }),
      );

      expect(createRes).toBeInstanceOf(SalesApplicationResult);
      expect(createRes.isSuccess).toBe(true);

      const dto = createRes.getValue();
      // Verifying pure DTO format: no HTTP envelope
      expect((dto as unknown as { statusCode?: number }).statusCode).toBeUndefined();
      expect((dto as unknown as { headers?: unknown }).headers).toBeUndefined();
      expect((dto as unknown as { httpMethod?: string }).httpMethod).toBeUndefined();

      // Verifying canonical Money serialization
      expect(dto.subtotal.amount).toBe(2.0);
      expect(dto.total.amount).toBe(2.0);
      expect(dto.subtotal.formatted).toBe('2.00');
    });
  });

  // ===========================================================================
  // 3. Error Translation Readiness for Future Controllers
  // ===========================================================================
  describe('Error Translation Readiness for Future Controllers', () => {
    it('emits SaleNotFoundException that future controllers/filters translate to HTTP 404', async () => {
      const result = await getSaleHandler.execute(
        new GetSaleQuery({ saleId: 'non_existent_sale' }),
      );

      expect(result.isFailure).toBe(true);
      const error = result.getError();
      expect(error).toBeInstanceOf(SaleNotFoundException);
      expect((error as Error).message).toContain('non_existent_sale');

      // Future controller translation simulation:
      // if (error instanceof SaleNotFoundException) -> HTTP 404
      const httpStatus = error instanceof SaleNotFoundException ? 404 : 500;
      expect(httpStatus).toBe(404);
    });

    it('emits DuplicateSaleException that future controllers/filters translate to HTTP 409 Conflict', async () => {
      const source = {
        sourceType: SourceType.TREATMENT_SESSION,
        sourceId: 'treatment_session_unique',
      };

      // Create first sale
      await createSaleHandler.execute(
        new CreateSaleCommand({
          tenantId: 'tenant_01',
          currency: 'USD',
          source,
          items: [{ description: 'First Session', quantity: 1, unitPriceAmount: 50 }],
        }),
      );

      // Attempt duplicate creation
      const dupResult = await createSaleHandler.execute(
        new CreateSaleCommand({
          tenantId: 'tenant_01',
          currency: 'USD',
          source,
          items: [{ description: 'Duplicate Session', quantity: 1, unitPriceAmount: 50 }],
        }),
      );

      expect(dupResult.isFailure).toBe(true);
      const error = dupResult.getError();
      expect(error).toBeInstanceOf(DuplicateSaleException);

      // Future controller translation simulation:
      // if (error instanceof DuplicateSaleException) -> HTTP 409
      const httpStatus = error instanceof DuplicateSaleException ? 409 : 500;
      expect(httpStatus).toBe(409);
    });

    it('emits SaleAlreadyFinalizedException that future controllers translate to HTTP 409 Conflict', async () => {
      // Create and cancel a sale
      const createRes = await createSaleHandler.execute(
        new CreateSaleCommand({
          tenantId: 'tenant_01',
          currency: 'USD',
          source: { sourceType: SaleSourceType.FOOD, sourceId: 'k1' },
          items: [{ description: 'Juice', quantity: 1, unitPriceAmount: 5 }],
        }),
      );
      const saleId = createRes.getValue().id;
      await cancelSaleHandler.execute(new CancelSaleCommand({ saleId, reason: 'Voided' }));

      // Attempt to apply discount to cancelled sale
      const discResult = await applyDiscountHandler.execute(
        new ApplyDiscountCommand({
          saleId,
          discount: { type: DiscountType.FIXED, value: 2 },
        }),
      );

      expect(discResult.isFailure).toBe(true);
      const error = discResult.getError();
      expect(error).toBeInstanceOf(SaleAlreadyFinalizedException);

      // Future controller translation simulation:
      const httpStatus = error instanceof SaleAlreadyFinalizedException ? 409 : 500;
      expect(httpStatus).toBe(409);
    });

    it('emits InvalidMoneyException that future controllers translate to HTTP 400 Bad Request', async () => {
      // Create a valid sale first
      const createRes = await createSaleHandler.execute(
        new CreateSaleCommand({
          tenantId: 'tenant_01',
          currency: 'USD',
          source: { sourceType: SaleSourceType.FOOD, sourceId: 'k1' },
        }),
      );
      const saleId = createRes.getValue().id;

      // Add item with negative price amount triggers InvalidMoneyException
      const result = await addSaleItemHandler.execute(
        new AddSaleItemCommand({
          saleId,
          description: 'Corrupted item price',
          quantity: 1,
          unitPriceAmount: -25.0,
        }),
      );

      expect(result.isFailure).toBe(true);
      const error = result.getError();
      expect(error).toBeInstanceOf(InvalidMoneyException);

      // Future controller translation simulation:
      const httpStatus = error instanceof InvalidMoneyException ? 400 : 500;
      expect(httpStatus).toBe(400);
    });

    it('emits InvalidDiscountException that future controllers translate to HTTP 422 Unprocessable', async () => {
      const createRes = await createSaleHandler.execute(
        new CreateSaleCommand({
          tenantId: 'tenant_01',
          currency: 'USD',
          source: { sourceType: SaleSourceType.FOOD, sourceId: 'k1' },
          items: [{ description: 'Juice', quantity: 1, unitPriceAmount: 5 }],
        }),
      );
      const saleId = createRes.getValue().id;

      const discResult = await applyDiscountHandler.execute(
        new ApplyDiscountCommand({
          saleId,
          discount: { type: DiscountType.PERCENTAGE, value: 150 }, // > 100%
        }),
      );

      expect(discResult.isFailure).toBe(true);
      const error = discResult.getError();
      expect(error).toBeInstanceOf(InvalidDiscountException);

      // Future controller translation simulation:
      const httpStatus = error instanceof InvalidDiscountException ? 422 : 500;
      expect(httpStatus).toBe(422);
    });
  });

  // ===========================================================================
  // 4. Static Architectural Boundary Verification (Zero Framework Leaks)
  // ===========================================================================
  describe('Static Architectural Boundary Verification (Zero Framework Leaks)', () => {
    it('verifies that no source file in sales/application imports @nestjs, express, or @prisma', () => {
      const applicationDir = path.resolve(__dirname, '..');

      function getAllFiles(dir: string, fileList: string[] = []): string[] {
        const files = fs.readdirSync(dir);
        for (const file of files) {
          const filePath = path.join(dir, file);
          const stat = fs.statSync(filePath);
          if (stat.isDirectory()) {
            if (file !== '__tests__') {
              getAllFiles(filePath, fileList);
            }
          } else if (file.endsWith('.ts') && !file.endsWith('.spec.ts')) {
            fileList.push(filePath);
          }
        }
        return fileList;
      }

      const sourceFiles = getAllFiles(applicationDir);
      expect(sourceFiles.length).toBeGreaterThan(15);

      const forbiddenImports = [
        '@nestjs/common',
        '@nestjs/core',
        '@nestjs/swagger',
        'express',
        '@prisma/client',
        'graphql',
      ];

      const forbiddenDecorators = ['@Injectable', '@Controller', '@Catch', '@UseGuards'];

      for (const filePath of sourceFiles) {
        const content = fs.readFileSync(filePath, 'utf-8');

        // Check for forbidden module imports
        for (const forbidden of forbiddenImports) {
          const regex = new RegExp(`from\\s+['"]${forbidden}['"]`, 'g');
          const hasForbidden = regex.test(content);
          if (hasForbidden) {
            throw new Error(
              `Architectural violation in ${path.basename(filePath)}: imports '${forbidden}'. Application layer must remain framework-free.`,
            );
          }
        }

        // Check for forbidden NestJS class decorators
        for (const decorator of forbiddenDecorators) {
          const regex = new RegExp(`^\\s*${decorator}\\b`, 'm');
          const hasDecorator = regex.test(content);
          if (hasDecorator) {
            throw new Error(
              `Architectural violation in ${path.basename(filePath)}: uses '${decorator}' decorator. Application layer must remain framework-free.`,
            );
          }
        }
      }
    });
  });
});
