import { CreateSaleHandler } from '../handlers/create-sale.handler';
import { CreateSaleCommand } from '../commands/create-sale.command';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { PrismaSaleRepository } from '../../infrastructure/persistence/prisma/repositories/prisma-sale.repository';
import { Sale } from '../../domain/sale.aggregate';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { SourceReference } from '../../domain/value-objects/source-reference.vo';
import { SourceType } from '../../domain/enums/source-type.enum';
import { SaleStatus } from '../../domain/enums/sale-status.enum';
import { DeterministicClock } from '../../domain/shared/clock';
import { DuplicateSaleException } from '../../domain/exceptions/duplicate-sale.exception';
import { InvalidSaleStateException } from '../../domain/exceptions/invalid-sale-state.exception';
import { Prisma } from '@prisma/client';

// In-Memory Test Double for Application Layer Tests
class InMemorySaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async findBySourceReference(
    sourceType: SourceType,
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

describe('Commercial Transaction Uniqueness & Exactly-One-Sale Invariant (ADR-0120)', () => {
  const tenantId = 'tenant_kinergy_main';
  const clientId = 'client_12345';
  const baseTime = new Date('2026-09-28T10:00:00.000Z');

  let clock: DeterministicClock;
  let saleRepo: InMemorySaleRepository;
  let handler: CreateSaleHandler;

  beforeEach(() => {
    clock = new DeterministicClock(baseTime);
    saleRepo = new InMemorySaleRepository();
    handler = new CreateSaleHandler(saleRepo, clock);
  });

  describe('1. Application Idempotency & Safe Retry Semantics', () => {
    it('creates a Sale on initial submission with an idempotencyKey / saleId', async () => {
      const command = new CreateSaleCommand({
        id: 'sale_idem_001',
        tenantId,
        clientId,
        currency: 'USD',
        source: {
          sourceType: SourceType.CUSTOM_SERVICE,
          sourceId: 'pos_terminal_1',
          sourceCode: 'POS_REGISTER',
        },
        items: [
          {
            description: 'Kinesio Session Regular',
            quantity: 1,
            unitPriceAmount: 75.0,
          },
        ],
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      const val = result.getValue();
      expect(val.id).toBe('sale_idem_001');
      expect(val.totalAmount).toBe(75.0);
      expect(val.status).toBe(SaleStatus.DRAFT);
      expect(saleRepo.store.has('sale_idem_001')).toBe(true);
    });

    it('returns existing SaleDTO on identical network retry (idempotent replay)', async () => {
      const command = new CreateSaleCommand({
        idempotencyKey: 'idem_key_network_retry_001',
        tenantId,
        clientId,
        currency: 'USD',
        source: {
          sourceType: SourceType.CUSTOM_SERVICE,
          sourceId: 'pos_terminal_1',
          sourceCode: 'POS_REGISTER',
        },
        items: [
          {
            description: 'Kinesio Assessment',
            quantity: 1,
            unitPriceAmount: 120.0,
          },
        ],
      });

      // Initial execution
      const firstResult = await handler.execute(command);
      expect(firstResult.isSuccess).toBe(true);
      const createdSale = firstResult.getValue();

      // Advance clock to simulate retry arriving 3 seconds later
      clock.advanceSeconds(3);

      // Identical retry with same idempotency key and matching parameters
      const retryResult = await handler.execute(command);

      expect(retryResult.isSuccess).toBe(true);
      const replayedSale = retryResult.getValue();
      expect(replayedSale.id).toBe(createdSale.id);
      expect(replayedSale.totalAmount).toBe(createdSale.totalAmount);
      expect(replayedSale.createdAt).toBe(createdSale.createdAt);
      // Ensures no duplicate records were persisted
      expect(saleRepo.store.size).toBe(1);
    });

    it('rejects reuse of idempotency key with conflicting transaction parameters', async () => {
      const originalCommand = new CreateSaleCommand({
        idempotencyKey: 'idem_conflict_key_999',
        tenantId,
        clientId,
        currency: 'USD',
        source: {
          sourceType: SourceType.CUSTOM_SERVICE,
          sourceId: 'pos_terminal_1',
        },
        items: [
          {
            description: 'Treatment Pack A',
            quantity: 1,
            unitPriceAmount: 50.0,
          },
        ],
      });

      const firstResult = await handler.execute(originalCommand);
      expect(firstResult.isSuccess).toBe(true);

      // Conflicting request: same idempotency key but different client
      const conflictingCommand = new CreateSaleCommand({
        idempotencyKey: 'idem_conflict_key_999',
        tenantId,
        clientId: 'client_different_999',
        currency: 'USD',
        source: {
          sourceType: SourceType.CUSTOM_SERVICE,
          sourceId: 'pos_terminal_1',
        },
        items: [
          {
            description: 'Treatment Pack A',
            quantity: 1,
            unitPriceAmount: 50.0,
          },
        ],
      });

      const secondResult = await handler.execute(conflictingCommand);

      expect(secondResult.isSuccess).toBe(false);
      const err = secondResult.getError();
      expect(err).toBeInstanceOf(DuplicateSaleException);
      const dupError = err as DuplicateSaleException;
      expect(dupError.code).toBe('DUPLICATE_SALE_DETECTED');
      expect(dupError.message).toContain('already exists with different transaction parameters');
    });
  });

  describe('2. Operational Single-Billing Entity Invariant (TreatmentSession)', () => {
    it('prohibits duplicate Sale creation for the same active TreatmentSession', async () => {
      const sessionId = 'session_clinical_4444';

      // First bill for session_clinical_4444
      const firstCommand = new CreateSaleCommand({
        tenantId,
        clientId,
        currency: 'USD',
        source: {
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: sessionId,
        },
        items: [
          {
            description: 'Physical Therapy Session',
            quantity: 1,
            unitPriceAmount: 90.0,
          },
        ],
      });

      const firstResult = await handler.execute(firstCommand);
      expect(firstResult.isSuccess).toBe(true);
      const firstSaleId = firstResult.getValue().id;

      // Second attempt to bill the exact same session (e.g. from another register or cashier)
      const secondCommand = new CreateSaleCommand({
        tenantId,
        clientId,
        currency: 'USD',
        source: {
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: sessionId,
        },
        items: [
          {
            description: 'Physical Therapy Session',
            quantity: 1,
            unitPriceAmount: 90.0,
          },
        ],
      });

      const secondResult = await handler.execute(secondCommand);

      expect(secondResult.isSuccess).toBe(false);
      const err = secondResult.getError();
      expect(err).toBeInstanceOf(DuplicateSaleException);
      const dupError = err as DuplicateSaleException;
      expect(dupError.code).toBe('DUPLICATE_SALE_DETECTED');
      expect(dupError.existingSaleId).toBe(firstSaleId);
      expect(dupError.message).toContain(`already exists for TreatmentSession '${sessionId}'`);
      expect(saleRepo.store.size).toBe(1);
    });

    it('allows new Sale creation for TreatmentSession if previous Sale was CANCELLED', async () => {
      const sessionId = 'session_clinical_cancelled_recovery';

      // Create initial sale
      const firstCommand = new CreateSaleCommand({
        tenantId,
        clientId,
        currency: 'USD',
        source: {
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: sessionId,
        },
        items: [
          {
            description: 'Physical Therapy Session',
            quantity: 1,
            unitPriceAmount: 90.0,
          },
        ],
      });

      const firstResult = await handler.execute(firstCommand);
      expect(firstResult.isSuccess).toBe(true);
      const initialSale = saleRepo.store.get(firstResult.getValue().id)!;

      // Transition initial sale to CANCELLED (e.g. client walked out or checkout was voided)
      initialSale.cancel('Client card declined, transaction aborted', clock);
      expect(initialSale.status).toBe(SaleStatus.CANCELLED);

      // Subsequent attempt to bill the session must now succeed because previous sale is inactive
      const reattemptCommand = new CreateSaleCommand({
        tenantId,
        clientId,
        currency: 'USD',
        source: {
          sourceType: SourceType.TREATMENT_SESSION,
          sourceId: sessionId,
        },
        items: [
          {
            description: 'Physical Therapy Session - Reattempt',
            quantity: 1,
            unitPriceAmount: 90.0,
          },
        ],
      });

      const reattemptResult = await handler.execute(reattemptCommand);

      expect(reattemptResult.isSuccess).toBe(true);
      expect(reattemptResult.getValue().id).not.toBe(initialSale.id.value);
      expect(saleRepo.store.size).toBe(2);
    });
  });

  describe('3. External Order Reference Uniqueness (sourceCode)', () => {
    it('prohibits duplicate Sale creation when external order reference already exists', async () => {
      const externalOrderCode = 'EXT-ORDER-2026-X891';

      const firstCommand = new CreateSaleCommand({
        tenantId,
        clientId,
        currency: 'USD',
        source: {
          sourceType: SourceType.CUSTOM_SERVICE,
          sourceId: 'ext_order_sys_1',
          sourceCode: externalOrderCode,
        },
        items: [
          {
            description: 'Online Package Order',
            quantity: 1,
            unitPriceAmount: 200.0,
          },
        ],
      });

      const firstResult = await handler.execute(firstCommand);
      expect(firstResult.isSuccess).toBe(true);

      // Attempt to create another sale with same order code but conflicting parameters
      const secondCommand = new CreateSaleCommand({
        tenantId,
        clientId: 'another_client_888',
        currency: 'EUR',
        source: {
          sourceType: SourceType.CUSTOM_SERVICE,
          sourceId: 'ext_order_sys_2',
          sourceCode: externalOrderCode,
        },
        items: [
          {
            description: 'Online Package Order Conflicting',
            quantity: 1,
            unitPriceAmount: 250.0,
          },
        ],
      });

      const secondResult = await handler.execute(secondCommand);

      expect(secondResult.isSuccess).toBe(false);
      const err = secondResult.getError();
      expect(err).toBeInstanceOf(DuplicateSaleException);
      const dupError = err as DuplicateSaleException;
      expect(dupError.message).toContain(
        `already exists with order reference '${externalOrderCode}'`,
      );
    });

    it('permits multiple independent Sales on shared POS terminal tag (generic origin)', async () => {
      // Generic POS tags represent register hardware, not single-use commercial transaction IDs
      const sale1Command = new CreateSaleCommand({
        tenantId,
        clientId,
        currency: 'USD',
        source: {
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'pos_reg_01',
          sourceCode: 'POS_REGISTER',
        },
        items: [{ description: 'Water Bottle', quantity: 1, unitPriceAmount: 3.5 }],
      });

      const sale2Command = new CreateSaleCommand({
        tenantId,
        clientId: 'client_next_in_line',
        currency: 'USD',
        source: {
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'pos_reg_01',
          sourceCode: 'POS_REGISTER',
        },
        items: [{ description: 'Towel Large', quantity: 1, unitPriceAmount: 15.0 }],
      });

      const result1 = await handler.execute(sale1Command);
      const result2 = await handler.execute(sale2Command);

      expect(result1.isSuccess).toBe(true);
      expect(result2.isSuccess).toBe(true);
      expect(result1.getValue().id).not.toBe(result2.getValue().id);
      expect(saleRepo.store.size).toBe(2);
    });
  });

  describe('4. Proof: Random UUID Generation Alone Fails Transaction Uniqueness', () => {
    it('demonstrates how unanchored requests generate phantom duplicate sales on retry without business identity', async () => {
      // If client sends requests with generic source and no idempotency key or business reference:
      const commandA = new CreateSaleCommand({
        tenantId,
        currency: 'USD',
        source: {
          sourceType: SourceType.CUSTOM_SERVICE,
          sourceId: 'pos_terminal_1',
        },
        items: [{ description: 'Generic item', quantity: 1, unitPriceAmount: 10 }],
      });

      const commandB = new CreateSaleCommand({
        tenantId,
        currency: 'USD',
        source: {
          sourceType: SourceType.CUSTOM_SERVICE,
          sourceId: 'pos_terminal_1',
        },
        items: [{ description: 'Generic item', quantity: 1, unitPriceAmount: 10 }],
      });

      const resA = await handler.execute(commandA);
      const resB = await handler.execute(commandB);

      // Without an idempotencyKey, unique order reference, or operational single-billing entity,
      // random UUIDs produce 2 separate sales for what might have been a double-clicked request.
      expect(resA.getValue().id).not.toBe(resB.getValue().id);
      expect(saleRepo.store.size).toBe(2);

      // Now demonstrate how providing the transaction identity (idempotency key) enforces exactly-one-sale:
      const anchoredCommand1 = new CreateSaleCommand({
        idempotencyKey: 'tx_register_click_1001',
        tenantId,
        currency: 'USD',
        source: {
          sourceType: SourceType.CUSTOM_SERVICE,
          sourceId: 'pos_terminal_1',
        },
        items: [{ description: 'Generic item', quantity: 1, unitPriceAmount: 10 }],
      });

      const anchoredCommand2 = new CreateSaleCommand({
        idempotencyKey: 'tx_register_click_1001',
        tenantId,
        currency: 'USD',
        source: {
          sourceType: SourceType.CUSTOM_SERVICE,
          sourceId: 'pos_terminal_1',
        },
        items: [{ description: 'Generic item', quantity: 1, unitPriceAmount: 10 }],
      });

      const anchoredRes1 = await handler.execute(anchoredCommand1);
      const anchoredRes2 = await handler.execute(anchoredCommand2);

      // Exactly one Sale represents the commercial transaction!
      expect(anchoredRes1.getValue().id).toBe(anchoredRes2.getValue().id);
      expect(saleRepo.store.size).toBe(3); // 2 previous + 1 anchored
    });
  });

  describe('5. Persistence Serialization & Concurrency Conflict Mapping (PrismaSaleRepository)', () => {
    it('translates Prisma P2002 unique constraint error into DuplicateSaleException', async () => {
      // Simulate Prisma Client throwing P2002 on concurrent primary key insertion
      const mockPrisma = {
        $transaction: jest
          .fn()
          .mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
            const fakeTx = {
              sale: {
                findUnique: jest.fn().mockResolvedValue(null),
                findFirst: jest.fn().mockResolvedValue(null),
                upsert: jest.fn().mockRejectedValue(
                  new Prisma.PrismaClientKnownRequestError(
                    'Unique constraint failed on the constraint: Sale_pkey',
                    {
                      code: 'P2002',
                      clientVersion: '5.0.0',
                    },
                  ),
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

      const sale = Sale.create(
        {
          id: SaleId.create('sale_concurrency_race_001'),
          tenantId,
          currency: 'USD',
          source: SourceReference.create({
            sourceType: SourceType.CUSTOM_SERVICE,
            sourceId: 'pos_desk_1',
          }),
        },
        clock,
      );

      await expect(prismaRepo.save(sale)).rejects.toThrow(DuplicateSaleException);
      await expect(prismaRepo.save(sale)).rejects.toThrow(
        "Unique constraint violation: A Sale with ID 'sale_concurrency_race_001' already exists in persistence.",
      );
    });

    it('enforces single-billing for TreatmentSession directly at persistence layer', async () => {
      const mockPrisma = {
        $transaction: jest
          .fn()
          .mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
            const fakeTx = {
              sale: {
                findUnique: jest.fn().mockResolvedValue(null),
                findFirst: jest.fn().mockImplementation(async (query: unknown) => {
                  const q = query as { where?: { sourceType?: SourceType } };
                  if (q?.where?.sourceType === SourceType.TREATMENT_SESSION) {
                    return { id: 'sale_existing_session_owner_999' };
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

      const sale = Sale.create(
        {
          id: SaleId.create('sale_new_attempt_001'),
          tenantId,
          currency: 'USD',
          source: SourceReference.create({
            sourceType: SourceType.TREATMENT_SESSION,
            sourceId: 'session_clinical_existing',
          }),
        },
        clock,
      );

      await expect(prismaRepo.save(sale)).rejects.toThrow(DuplicateSaleException);
      await expect(prismaRepo.save(sale)).rejects.toThrow(
        "An active Sale ('sale_existing_session_owner_999') already exists for TREATMENT_SESSION 'session_clinical_existing'",
      );
    });

    it('rejects persistence mutation if Sale is already CANCELLED in database', async () => {
      const mockPrisma = {
        $transaction: jest
          .fn()
          .mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => {
            const fakeTx = {
              sale: {
                findUnique: jest.fn().mockResolvedValue({ status: 'CANCELLED' }),
              },
            };
            return callback(fakeTx);
          }),
      };

      const prismaRepo = new PrismaSaleRepository(
        mockPrisma as unknown as Prisma.TransactionClient as never,
      );

      const sale = Sale.create(
        {
          id: SaleId.create('sale_terminal_cancelled_001'),
          tenantId,
          currency: 'USD',
          source: SourceReference.create({
            sourceType: SourceType.CUSTOM_SERVICE,
            sourceId: 'pos_desk_1',
          }),
        },
        clock,
      );

      await expect(prismaRepo.save(sale)).rejects.toThrow(InvalidSaleStateException);
      await expect(prismaRepo.save(sale)).rejects.toThrow(
        'Sale is already in terminal CANCELLED status in persistence',
      );
    });
  });
});
