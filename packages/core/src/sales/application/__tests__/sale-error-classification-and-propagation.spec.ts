import { CreateSaleHandler } from '../handlers/create-sale.handler';
import { AddSaleItemHandler } from '../handlers/add-sale-item.handler';
import { RemoveSaleItemHandler } from '../handlers/remove-sale-item.handler';
import { ApplyDiscountHandler } from '../handlers/apply-discount.handler';
import { CancelSaleHandler } from '../handlers/cancel-sale.handler';
import { CalculateSaleHandler } from '../queries/calculate-sale.handler';
import { GetSaleHandler } from '../queries/get-sale.handler';
import { ListSalesHandler } from '../queries/list-sales.handler';

import { CreateSaleCommand } from '../commands/create-sale.command';
import { AddSaleItemCommand } from '../commands/add-sale-item.command';
import { RemoveSaleItemCommand } from '../commands/remove-sale-item.command';
import { ApplyDiscountCommand } from '../commands/apply-discount.command';
import { CancelSaleCommand } from '../commands/cancel-sale.command';
import { CalculateSaleQuery } from '../queries/calculate-sale.query';
import { GetSaleQuery } from '../queries/get-sale.query';
import { ListSalesQuery } from '../queries/list-sales.query';

import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { ClientFacadePort } from '../ports/client-facade.port';
import { SaleSourceValidatorPort } from '../ports/sale-source-validator.port';
import { Sale } from '../../domain/sale.aggregate';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { SourceReference } from '../../domain/value-objects/source-reference.vo';
import { SourceType } from '../../domain/enums/source-type.enum';
import { Money } from '../../domain/value-objects/money.vo';
import { DeterministicClock } from '../../domain/shared/clock';

// Domain Exceptions
import {
  InvalidMoneyException,
  InvalidDiscountException,
  InvalidSaleStateException,
  InvalidSaleTransitionException,
  DuplicateSaleException,
  SaleAlreadyFinalizedException,
} from '../../domain/exceptions';

// Application Exceptions
import {
  SaleNotFoundException,
  ClientNotFoundException,
  SourceNotFoundException,
  InvalidSaleQueryException,
} from '../exceptions';

class MockSaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public throwOnSave?: Error;
  public throwOnFind?: Error;

  async findById(id: string): Promise<Sale | null> {
    if (this.throwOnFind) throw this.throwOnFind;
    return this.store.get(id) ?? null;
  }

  async getById(id: string): Promise<Sale | null> {
    return this.findById(id);
  }

  async save(sale: Sale): Promise<void> {
    if (this.throwOnSave) throw this.throwOnSave;
    this.store.set(sale.id.value, sale);
  }

  async findBySourceReference(): Promise<Sale | null> {
    return null;
  }

  async findBySourceCode(): Promise<Sale | null> {
    return null;
  }
}

describe('Sale Use Cases Comprehensive Error Classification & Propagation Matrix', () => {
  const clock = new DeterministicClock(new Date('2026-10-01T12:00:00.000Z'));
  const validSource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv-item-001',
    sourceCode: 'SKU-001',
  });

  function createDraftSale(id = 'sale-001'): Sale {
    const sale = Sale.create(
      { id: SaleId.create(id), currency: 'USD', source: validSource },
      clock,
    );
    sale.addItem({
      source: validSource,
      description: 'First Item',
      quantity: 1,
      unitPrice: Money.create(50.0, 'USD'),
    });
    return sale;
  }

  describe('1. Application-Tier Errors', () => {
    it('propagates SaleNotFoundException when aggregate does not exist (AddSaleItem)', async () => {
      const repo = new MockSaleRepository();
      const handler = new AddSaleItemHandler(repo, clock);

      const result = await handler.execute(
        new AddSaleItemCommand({
          saleId: 'non-existent-sale',
          description: 'Item',
          quantity: 1,
          unitPriceAmount: 10,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
      expect((result.getError() as Error).message).toContain(
        "Sale with ID 'non-existent-sale' was not found.",
      );
    });

    it('propagates SaleNotFoundException for GetSale, CalculateSale, and CancelSale', async () => {
      const repo = new MockSaleRepository();
      const getHandler = new GetSaleHandler(repo);
      const calcHandler = new CalculateSaleHandler(repo);
      const cancelHandler = new CancelSaleHandler(repo, clock);

      const getRes = await getHandler.execute(new GetSaleQuery({ saleId: 'missing-1' }));
      expect(getRes.isFailure).toBe(true);
      expect(getRes.getError()).toBeInstanceOf(SaleNotFoundException);

      const calcRes = await calcHandler.execute(new CalculateSaleQuery({ saleId: 'missing-2' }));
      expect(calcRes.isFailure).toBe(true);
      expect(calcRes.getError()).toBeInstanceOf(SaleNotFoundException);

      const cancelRes = await cancelHandler.execute(
        new CancelSaleCommand({ saleId: 'missing-3', reason: 'Cancel' }),
      );
      expect(cancelRes.isFailure).toBe(true);
      expect(cancelRes.getError()).toBeInstanceOf(SaleNotFoundException);
    });

    it('propagates ClientNotFoundException when Client does not exist (CreateSale)', async () => {
      const repo = new MockSaleRepository();
      const mockClientFacade: ClientFacadePort = {
        getClientSummary: jest.fn().mockResolvedValue(null),
      };

      const handler = new CreateSaleHandler(repo, clock, undefined, undefined, mockClientFacade);
      const result = await handler.execute(
        new CreateSaleCommand({
          clientId: 'non-existent-client',
          source: {
            sourceType: 'INVENTORY_ITEM',
            sourceId: 'inv-1',
          },
          items: [{ description: 'Test', quantity: 1, unitPriceAmount: 10 }],
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(ClientNotFoundException);
      expect((result.getError() as ClientNotFoundException).code).toBe('CLIENT_NOT_FOUND');
    });

    it('propagates SourceNotFoundException when originating source cannot be resolved', async () => {
      const repo = new MockSaleRepository();
      const mockValidator: SaleSourceValidatorPort = {
        validateSource: jest.fn().mockResolvedValue({
          isValid: false,
          exists: false,
          errorMessage: "TreatmentSession 'session-999' does not exist.",
        }),
      };

      const handler = new CreateSaleHandler(repo, clock, undefined, mockValidator);
      const result = await handler.execute(
        new CreateSaleCommand({
          source: {
            sourceType: 'TREATMENT_SESSION',
            sourceId: 'session-999',
          },
          items: [{ description: 'Session', quantity: 1, unitPriceAmount: 100 }],
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SourceNotFoundException);
      expect((result.getError() as SourceNotFoundException).code).toBe('SOURCE_NOT_FOUND');
    });

    it('propagates InvalidSaleQueryException for malformed ListSales pagination or filter', async () => {
      const repo = new MockSaleRepository();
      const handler = new ListSalesHandler(repo);

      const result = await handler.execute(
        new ListSalesQuery({
          page: 0, // Invalid: page must be >= 1
          limit: 10,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidSaleQueryException);
      expect((result.getError() as InvalidSaleQueryException).code).toBe('INVALID_PAGINATION');
    });
  });

  describe('2. Domain Invariant Errors (Propagated Without Replication)', () => {
    it('propagates InvalidSaleTransitionException when attempting to cancel a settled sale', async () => {
      const repo = new MockSaleRepository();
      const sale = createDraftSale('sale-settled');
      sale.finalize(clock);
      sale.markPaid(clock);
      await repo.save(sale);

      const handler = new CancelSaleHandler(repo, clock);
      const result = await handler.execute(
        new CancelSaleCommand({
          saleId: 'sale-settled',
          reason: 'Customer wants cancellation',
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidSaleTransitionException);
      expect((result.getError() as Error).message).toContain('cannot be cancelled');
    });

    it('propagates SaleAlreadyFinalizedException when attempting to mutate non-draft Sale (AddSaleItem)', async () => {
      const repo = new MockSaleRepository();
      const sale = createDraftSale('sale-finalized');
      sale.finalize(clock);
      await repo.save(sale);

      const handler = new AddSaleItemHandler(repo, clock);
      const result = await handler.execute(
        new AddSaleItemCommand({
          saleId: 'sale-finalized',
          description: 'Late Addition',
          quantity: 1,
          unitPriceAmount: 20,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);
    });

    it('propagates InvalidSaleStateException when removing non-existent item from Sale', async () => {
      const repo = new MockSaleRepository();
      const sale = createDraftSale('sale-items');
      await repo.save(sale);

      const handler = new RemoveSaleItemHandler(repo, clock);
      const result = await handler.execute(
        new RemoveSaleItemCommand({
          saleId: 'sale-items',
          itemId: 'non-existent-item-id',
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      expect((result.getError() as Error).message).toContain('not found in Sale');
    });

    it('propagates InvalidDiscountException when discount exceeds allowed range (ApplyDiscount)', async () => {
      const repo = new MockSaleRepository();
      const sale = createDraftSale('sale-disc');
      await repo.save(sale);

      const handler = new ApplyDiscountHandler(repo, clock);
      const result = await handler.execute(
        new ApplyDiscountCommand({
          saleId: 'sale-disc',
          discount: {
            type: 'PERCENTAGE',
            value: 120, // Invalid: exceeds 100%
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidDiscountException);
      expect((result.getError() as Error).message).toContain(
        'Percentage discount cannot exceed 100%',
      );
    });

    it('propagates InvalidMoneyException when unit price is negative (AddSaleItem)', async () => {
      const repo = new MockSaleRepository();
      const sale = createDraftSale('sale-neg-money');
      await repo.save(sale);

      const handler = new AddSaleItemHandler(repo, clock);
      const result = await handler.execute(
        new AddSaleItemCommand({
          saleId: 'sale-neg-money',
          description: 'Negative Item',
          quantity: 1,
          unitPriceAmount: -50.0,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidMoneyException);
    });

    it('propagates DuplicateSaleException when active clinical session sale already exists', async () => {
      const repo = new MockSaleRepository();
      repo.findBySourceReference = jest.fn().mockResolvedValue(createDraftSale('existing-sale'));

      const handler = new CreateSaleHandler(repo, clock);
      const result = await handler.execute(
        new CreateSaleCommand({
          source: {
            sourceType: 'TREATMENT_SESSION',
            sourceId: 'session-123',
          },
          items: [{ description: 'Session', quantity: 1, unitPriceAmount: 100 }],
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(DuplicateSaleException);
      expect((result.getError() as DuplicateSaleException).code).toBe('DUPLICATE_SALE_DETECTED');
    });
  });

  describe('3. Infrastructure & Persistence Errors', () => {
    it('propagates database persistence errors gracefully without masking or crashing', async () => {
      const repo = new MockSaleRepository();
      repo.throwOnSave = new Error('Database disk I/O failure or connection deadlock');
      const sale = createDraftSale('sale-infra');
      repo.store.set(sale.id.value, sale);

      const handler = new AddSaleItemHandler(repo, clock);
      const result = await handler.execute(
        new AddSaleItemCommand({
          saleId: 'sale-infra',
          description: 'Extra',
          quantity: 1,
          unitPriceAmount: 10,
        }),
      );

      expect(result.isFailure).toBe(true);
      expect((result.getError() as Error).message).toBe(
        'Database disk I/O failure or connection deadlock',
      );
    });
  });
});
