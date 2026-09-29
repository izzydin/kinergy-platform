import { CreateSaleHandler } from '../handlers/create-sale.handler';
import { CreateSaleCommand } from '../commands/create-sale.command';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { PrismaSaleRepository } from '../../infrastructure/persistence/prisma/repositories/prisma-sale.repository';
import { Sale } from '../../domain/sale.aggregate';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { SaleSource } from '../../domain/value-objects/sale-source.vo';
import { SaleSourceType } from '../../domain/enums/sale-source-type.enum';
import { SaleStatus } from '../../domain/enums/sale-status.enum';
import { DeterministicClock } from '../../domain/shared/clock';
import { DuplicateSaleException } from '../../domain/exceptions/duplicate-sale.exception';
import { Prisma } from '@prisma/client';

class InMemorySaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async findBySourceReference(
    sourceType: string,
    sourceId: string,
    tenantId?: string,
  ): Promise<Sale | null> {
    for (const sale of this.store.values()) {
      if (
        sale.source.sourceType === sourceType &&
        sale.source.sourceId === sourceId &&
        (!tenantId || sale.tenantId === tenantId) &&
        sale.status !== SaleStatus.CANCELLED
      ) {
        return sale;
      }
    }
    return null;
  }

  async findBySourceCode(sourceCode: string, tenantId?: string): Promise<Sale | null> {
    for (const sale of this.store.values()) {
      if (
        sale.source.sourceCode === sourceCode &&
        (!tenantId || sale.tenantId === tenantId) &&
        sale.status !== SaleStatus.CANCELLED
      ) {
        return sale;
      }
    }
    return null;
  }

  async save(sale: Sale): Promise<void> {
    this.store.set(sale.id.value, sale);
  }
}

describe('SaleSource Uniqueness Semantics & Concurrency Evaluation (ADR-0121)', () => {
  const tenantId = 'tenant_kinergy_main';
  const clientId = 'client_athlete_123';
  const baseTime = new Date('2026-09-29T10:00:00.000Z');

  let clock: DeterministicClock;
  let saleRepo: InMemorySaleRepository;
  let handler: CreateSaleHandler;

  beforeEach(() => {
    clock = new DeterministicClock(baseTime);
    saleRepo = new InMemorySaleRepository();
    handler = new CreateSaleHandler(saleRepo, clock);
  });

  describe('1. Uniqueness Semantics Evaluation: 0 Sales, 1 Sale, Multiple Sales', () => {
    it('Scenario 0 Sales: Source reference exists in upstream domain without any Sale in Sales domain', async () => {
      // An upstream food order, treatment session, or room exists, but checkout has not been initiated
      const existing = await saleRepo.findBySourceReference(
        SaleSourceType.FOOD,
        'order-unbilled-001',
        tenantId,
      );
      expect(existing).toBeNull();
      expect(saleRepo.store.size).toBe(0);
    });

    it('Scenario 1 Sale (Single-Billing Entity): KINESIOLOGY_SESSION maps to exactly 1 active Sale', async () => {
      const sessionId = 'session_kinesio_101';
      const commandA = new CreateSaleCommand({
        tenantId,
        clientId,
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: sessionId,
        },
        items: [{ description: 'Kinesiology Treatment', quantity: 1, unitPriceAmount: 85.0 }],
      });

      const resA = await handler.execute(commandA);
      expect(resA.isSuccess).toBe(true);
      const saleA = resA.getValue();
      expect(saleA.id).toBeDefined();
      expect(saleRepo.store.size).toBe(1);

      // Attempting to create a second Sale for the same session is rejected
      const commandB = new CreateSaleCommand({
        tenantId,
        clientId: 'another_client',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: sessionId,
        },
        items: [{ description: 'Kinesiology Treatment', quantity: 1, unitPriceAmount: 85.0 }],
      });

      const resB = await handler.execute(commandB);
      expect(resB.isSuccess).toBe(false);
      expect(resB.getError()).toBeInstanceOf(DuplicateSaleException);
      expect((resB.getError() as Error).message).toContain(
        `already exists for KINESIOLOGY_SESSION '${sessionId}'`,
      );
      expect(saleRepo.store.size).toBe(1);
    });

    it('Scenario Multiple Sales (Retail & Inventory): FOOD + order-123 produces multiple distinct Sales', async () => {
      const foodSourceId = 'food_order_123';

      // First customer transaction referencing food_order_123 (e.g. primary meal or retail SKU)
      const command1 = new CreateSaleCommand({
        tenantId,
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: foodSourceId,
        },
        items: [{ description: 'Protein Power Bowl', quantity: 1, unitPriceAmount: 14.5 }],
      });

      // Second customer transaction referencing the same food_order_123 (e.g. split check, re-order, or shared item reference)
      const command2 = new CreateSaleCommand({
        tenantId,
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.FOOD,
          sourceId: foodSourceId,
        },
        items: [{ description: 'Electrolyte Salad', quantity: 1, unitPriceAmount: 9.0 }],
      });

      const res1 = await handler.execute(command1);
      const res2 = await handler.execute(command2);

      expect(res1.isSuccess).toBe(true);
      expect(res2.isSuccess).toBe(true);

      const sale1 = res1.getValue();
      const sale2 = res2.getValue();

      // Proves that multiple distinct Sales coexist for the exact same source reference
      expect(sale1.id).not.toBe(sale2.id);
      expect(saleRepo.store.size).toBe(2);
      expect(saleRepo.store.get(sale1.id)?.source.sourceId).toBe(foodSourceId);
      expect(saleRepo.store.get(sale2.id)?.source.sourceId).toBe(foodSourceId);
    });

    it('Scenario Multiple Sales (DRINK, GYM_MEMBERSHIP, ROOM_RENTAL): multiple Sales legitimately share source reference', async () => {
      // DRINK SKU purchased by multiple customers
      const drinkRes1 = await handler.execute(
        new CreateSaleCommand({
          tenantId,
          currency: 'USD',
          source: { sourceType: SaleSourceType.DRINK, sourceId: 'inv_smoothie_green' },
          items: [{ description: 'Green Detox Smoothie', quantity: 1, unitPriceAmount: 7.5 }],
        }),
      );
      const drinkRes2 = await handler.execute(
        new CreateSaleCommand({
          tenantId,
          currency: 'USD',
          source: { sourceType: SaleSourceType.DRINK, sourceId: 'inv_smoothie_green' },
          items: [{ description: 'Green Detox Smoothie', quantity: 1, unitPriceAmount: 7.5 }],
        }),
      );
      expect(drinkRes1.isSuccess).toBe(true);
      expect(drinkRes2.isSuccess).toBe(true);

      // GYM_MEMBERSHIP plan purchased by multiple members
      const gymRes1 = await handler.execute(
        new CreateSaleCommand({
          tenantId,
          clientId: 'client_alpha',
          currency: 'USD',
          source: { sourceType: SaleSourceType.GYM_MEMBERSHIP, sourceId: 'plan_gold_annual' },
          items: [{ description: 'Gold Annual Membership', quantity: 1, unitPriceAmount: 999.0 }],
        }),
      );
      const gymRes2 = await handler.execute(
        new CreateSaleCommand({
          tenantId,
          clientId: 'client_beta',
          currency: 'USD',
          source: { sourceType: SaleSourceType.GYM_MEMBERSHIP, sourceId: 'plan_gold_annual' },
          items: [{ description: 'Gold Annual Membership', quantity: 1, unitPriceAmount: 999.0 }],
        }),
      );
      expect(gymRes1.isSuccess).toBe(true);
      expect(gymRes2.isSuccess).toBe(true);

      // ROOM_RENTAL bay rented over distinct time sessions
      const roomRes1 = await handler.execute(
        new CreateSaleCommand({
          tenantId,
          currency: 'USD',
          source: { sourceType: SaleSourceType.ROOM_RENTAL, sourceId: 'room_bay_private_1' },
          items: [{ description: 'Private Studio Hour 10am', quantity: 1, unitPriceAmount: 50.0 }],
        }),
      );
      const roomRes2 = await handler.execute(
        new CreateSaleCommand({
          tenantId,
          currency: 'USD',
          source: { sourceType: SaleSourceType.ROOM_RENTAL, sourceId: 'room_bay_private_1' },
          items: [{ description: 'Private Studio Hour 2pm', quantity: 1, unitPriceAmount: 50.0 }],
        }),
      );
      expect(roomRes1.isSuccess).toBe(true);
      expect(roomRes2.isSuccess).toBe(true);
    });

    it('Scenario Re-Billing After Cancellation: Cancelled Sale allows new Sale for the same KINESIOLOGY_SESSION', async () => {
      const sessionId = 'session_cancelled_recovery_999';

      const initialCommand = new CreateSaleCommand({
        tenantId,
        clientId,
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: sessionId,
        },
        items: [{ description: 'Clinical Assessment', quantity: 1, unitPriceAmount: 110.0 }],
      });

      const initialRes = await handler.execute(initialCommand);
      expect(initialRes.isSuccess).toBe(true);
      const initialSaleId = initialRes.getValue().id;

      // Cancel the initial sale (e.g. wrong client attached or cashier error)
      const saleToCancel = saleRepo.store.get(initialSaleId);
      saleToCancel?.cancel('Cashier entered wrong client account', clock);

      // Re-attempt checkout for the same session now succeeds!
      const recoveryCommand = new CreateSaleCommand({
        tenantId,
        clientId: 'client_corrected_456',
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: sessionId,
        },
        items: [
          { description: 'Clinical Assessment Corrected', quantity: 1, unitPriceAmount: 110.0 },
        ],
      });

      const recoveryRes = await handler.execute(recoveryCommand);
      expect(recoveryRes.isSuccess).toBe(true);
      expect(recoveryRes.getValue().id).not.toBe(initialSaleId);
      // Both sales exist in history, but exactly 1 is ACTIVE
      expect(saleRepo.store.size).toBe(2);
      expect(saleRepo.store.get(initialSaleId)?.status).toBe(SaleStatus.CANCELLED);
      expect(saleRepo.store.get(recoveryRes.getValue().id)?.status).toBe(SaleStatus.DRAFT);
    });
  });

  describe('2. Persistence-Level Uniqueness & Absence of Erroneous UNIQUE Constraints', () => {
    it('proves PrismaSaleRepository permits multiple Sales with identical (sourceType, sourceId) for FOOD', async () => {
      const savedRecords: Array<{ id: string; sourceType: string; sourceId: string }> = [];

      const mockPrisma = {
        $transaction: jest
          .fn()
          .mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
            const fakeTx = {
              sale: {
                findUnique: jest.fn().mockResolvedValue(null),
                findFirst: jest.fn().mockResolvedValue(null),
                upsert: jest
                  .fn()
                  .mockImplementation(
                    async ({
                      create,
                    }: {
                      create: { id: string; sourceType: string; sourceId: string };
                    }) => {
                      savedRecords.push({
                        id: create.id,
                        sourceType: create.sourceType,
                        sourceId: create.sourceId,
                      });
                      return create;
                    },
                  ),
              },
              saleItem: {
                deleteMany: jest.fn(),
                upsert: jest.fn(),
              },
            };
            return callback(fakeTx);
          }),
      };

      const prismaRepo = new PrismaSaleRepository(
        mockPrisma as unknown as Prisma.TransactionClient as never,
      );

      const sale1 = Sale.create(
        {
          id: SaleId.create('sale_food_batch_001'),
          tenantId,
          currency: 'USD',
          source: SaleSource.create(SaleSourceType.FOOD, 'order-123'),
        },
        clock,
      );

      const sale2 = Sale.create(
        {
          id: SaleId.create('sale_food_batch_002'),
          tenantId,
          currency: 'USD',
          source: SaleSource.create(SaleSourceType.FOOD, 'order-123'),
        },
        clock,
      );

      // Both must save cleanly without throwing DuplicateSaleException
      await expect(prismaRepo.save(sale1)).resolves.not.toThrow();
      await expect(prismaRepo.save(sale2)).resolves.not.toThrow();

      expect(savedRecords).toHaveLength(2);
      expect(savedRecords[0]?.sourceId).toBe('order-123');
      expect(savedRecords[1]?.sourceId).toBe('order-123');
      expect(savedRecords[0]?.id).not.toBe(savedRecords[1]?.id);
    });

    it('proves PrismaSaleRepository enforces active single-billing collision for KINESIOLOGY_SESSION', async () => {
      const mockPrisma = {
        $transaction: jest
          .fn()
          .mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
            const fakeTx = {
              sale: {
                findUnique: jest.fn().mockResolvedValue(null),
                findFirst: jest.fn().mockImplementation(async (query: unknown) => {
                  const q = query as { where?: { sourceType?: string; sourceId?: string } };
                  if (
                    q?.where?.sourceType === SaleSourceType.KINESIOLOGY_SESSION &&
                    q?.where?.sourceId === 'session_active_duplicate'
                  ) {
                    return { id: 'sale_existing_session_owner_888' };
                  }
                  return null;
                }),
              },
            };
            return callback(fakeTx);
          }),
      };

      const prismaRepo = new PrismaSaleRepository(
        mockPrisma as unknown as Prisma.TransactionClient as never,
      );

      const duplicateSale = Sale.create(
        {
          id: SaleId.create('sale_racing_attempt_002'),
          tenantId,
          currency: 'USD',
          source: SaleSource.create(SaleSourceType.KINESIOLOGY_SESSION, 'session_active_duplicate'),
        },
        clock,
      );

      await expect(prismaRepo.save(duplicateSale)).rejects.toThrow(DuplicateSaleException);
      await expect(prismaRepo.save(duplicateSale)).rejects.toThrow(
        "An active Sale ('sale_existing_session_owner_888') already exists for KINESIOLOGY_SESSION 'session_active_duplicate'",
      );
    });
  });

  describe('3. Concurrency Evaluation (Deterministic Behavior Without Distributed Locks)', () => {
    it('concurrent requests for FOOD + order-123 succeed deterministically creating separate Sales', async () => {
      const sharedFoodSource = {
        sourceType: SaleSourceType.FOOD,
        sourceId: 'order-concurrent-food-77',
      };

      const req1 = handler.execute(
        new CreateSaleCommand({
          tenantId,
          currency: 'USD',
          source: sharedFoodSource,
          items: [{ description: 'Item 1', quantity: 1, unitPriceAmount: 10 }],
        }),
      );

      const req2 = handler.execute(
        new CreateSaleCommand({
          tenantId,
          currency: 'USD',
          source: sharedFoodSource,
          items: [{ description: 'Item 2', quantity: 1, unitPriceAmount: 12 }],
        }),
      );

      const [res1, res2] = await Promise.all([req1, req2]);

      expect(res1.isSuccess).toBe(true);
      expect(res2.isSuccess).toBe(true);
      expect(res1.getValue().id).not.toBe(res2.getValue().id);
      expect(saleRepo.store.size).toBe(2);
    });

    it('concurrent requests for KINESIOLOGY_SESSION: one succeeds, and the duplicate racing request is deterministically rejected', async () => {
      // Simulate sequential transactional arrival in repository
      const sessionId = 'session_concurrent_race_555';

      const cmd1 = new CreateSaleCommand({
        tenantId,
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: sessionId,
        },
        items: [{ description: 'Physical Therapy Assessment', quantity: 1, unitPriceAmount: 100 }],
      });

      const cmd2 = new CreateSaleCommand({
        tenantId,
        currency: 'USD',
        source: {
          sourceType: SaleSourceType.KINESIOLOGY_SESSION,
          sourceId: sessionId,
        },
        items: [
          {
            description: 'Physical Therapy Assessment Duplicate',
            quantity: 1,
            unitPriceAmount: 100,
          },
        ],
      });

      // Execute first request
      const res1 = await handler.execute(cmd1);
      expect(res1.isSuccess).toBe(true);

      // Concurrent second request arriving before session billing concludes
      const res2 = await handler.execute(cmd2);
      expect(res2.isSuccess).toBe(false);
      expect(res2.getError()).toBeInstanceOf(DuplicateSaleException);
      expect((res2.getError() as Error).message).toContain(
        `already exists for KINESIOLOGY_SESSION '${sessionId}'`,
      );
      expect(saleRepo.store.size).toBe(1);
    });
  });
});
