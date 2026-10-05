import { GetSaleHandler } from '../queries/get-sale.handler';
import { GetSaleQuery, GetSaleByIdQuery } from '../queries/get-sale.query';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { Sale } from '../../domain/sale.aggregate';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { SaleSource } from '../../domain/value-objects/sale-source.vo';
import { Money } from '../../domain/value-objects/money.vo';
import { Discount } from '../../domain/value-objects/discount.vo';
import { SaleSourceType } from '../../domain/enums/sale-source-type.enum';
import { DeterministicClock } from '../../domain/shared/clock';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { InvalidSaleStateException } from '../../domain/exceptions/invalid-sale-state.exception';

class InMemorySaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public saveCallCount = 0;
  public findByIdCallCount = 0;
  public throwOnFind?: Error;

  async findById(id: SaleId | string): Promise<Sale | null> {
    this.findByIdCallCount++;
    if (this.throwOnFind) {
      throw this.throwOnFind;
    }
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.saveCallCount++;
    this.store.set(sale.id.value, sale);
  }

  clear(): void {
    this.store.clear();
    this.saveCallCount = 0;
    this.findByIdCallCount = 0;
    this.throwOnFind = undefined;
  }
}

function getErrorMessage(result: { getError(): Error | string | null }): string {
  const err = result.getError();
  return err instanceof Error ? err.message : String(err ?? '');
}

describe('GetSaleHandler Specification (Milestone 7.11 & ADR-0132 Section 4.6)', () => {
  const fixedNow = new Date('2026-10-04T15:00:00.000Z');
  let clock: DeterministicClock;
  let saleRepo: InMemorySaleRepository;
  let handler: GetSaleHandler;

  beforeEach(() => {
    clock = new DeterministicClock(fixedNow);
    saleRepo = new InMemorySaleRepository();
    handler = new GetSaleHandler(saleRepo);
  });

  const seedSampleSale = (saleIdStr = 'sale_get_01'): Sale => {
    const sale = Sale.create(
      {
        id: SaleId.create(saleIdStr),
        currency: 'USD',
        tenantId: 'tenant_kinergy_main',
        clientId: 'client_vip_999',
        source: SaleSource.create(SaleSourceType.FOOD, 'pos_terminal_01'),
        orderDiscount: Discount.percentage(10, '10% Cart Coupon'),
      },
      clock,
    );

    // Item 1 with line discount
    sale.addItem(
      {
        source: SaleSource.create(SaleSourceType.FOOD, 'food_inventory_1'),
        description: 'Protein Shake (Chocolate)',
        skuOrCode: 'SKU-SHAKE-01',
        quantity: 2,
        unitPrice: Money.create(5.5, 'USD'),
        discount: Discount.fixed(1.0, '$1 Line Off'),
      },
      clock,
    );

    // Item 2 without discount
    sale.addItem(
      {
        source: SaleSource.create(SaleSourceType.DRINK, 'drink_inventory_1'),
        description: 'Isotonic Electrolyte Drink',
        skuOrCode: 'SKU-DRINK-02',
        quantity: 1,
        unitPrice: Money.create(4.0, 'USD'),
      },
      clock,
    );

    sale.clearEvents();
    saleRepo.store.set(sale.id.value, sale);
    return sale;
  };

  describe('1. Identifier Validation at Application Boundary', () => {
    it('rejects null query execution with InvalidSaleStateException', async () => {
      const result = await handler.execute(null as unknown as GetSaleQuery);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      expect(getErrorMessage(result)).toContain('GetSale input cannot be null or undefined.');
      expect(saleRepo.findByIdCallCount).toBe(0);
    });

    it('rejects query with null input with InvalidSaleStateException', async () => {
      const result = await handler.execute({ input: null } as unknown as GetSaleQuery);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      expect(getErrorMessage(result)).toContain('GetSale input cannot be null or undefined.');
      expect(saleRepo.findByIdCallCount).toBe(0);
    });

    it('rejects empty string saleId with InvalidSaleStateException', async () => {
      const result = await handler.execute(new GetSaleQuery({ saleId: '' }));

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      expect(getErrorMessage(result)).toContain('Sale ID cannot be empty or whitespace.');
      expect(saleRepo.findByIdCallCount).toBe(0);
    });

    it('rejects whitespace-only saleId with InvalidSaleStateException', async () => {
      const result = await handler.execute(new GetSaleQuery({ saleId: '    ' }));

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      expect(getErrorMessage(result)).toContain('Sale ID cannot be empty or whitespace.');
      expect(saleRepo.findByIdCallCount).toBe(0);
    });
  });

  describe('2. Repository Loading & Established Not-Found Error Mapping', () => {
    it('maps non-existent sale to established SaleNotFoundException', async () => {
      const nonExistentId = 'sale_missing_888';

      const result = await handler.execute(new GetSaleQuery({ saleId: nonExistentId }));

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
      expect(getErrorMessage(result)).toBe(`Sale with ID '${nonExistentId}' was not found.`);
      expect(saleRepo.findByIdCallCount).toBe(1);
    });

    it('propagates repository unexpected infrastructure failures cleanly', async () => {
      saleRepo.throwOnFind = new Error('Database connection reset');

      const result = await handler.execute(new GetSaleQuery({ saleId: 'sale_01' }));

      expect(result.isFailure).toBe(true);
      expect(getErrorMessage(result)).toBe('Database connection reset');
    });
  });

  describe('3. Application DTO Representation (No Domain Entity or ORM Leaks)', () => {
    it('returns an immutable application SaleDTO rather than domain aggregate or Prisma entity', async () => {
      const sale = seedSampleSale('sale_dto_test_01');

      const result = await handler.execute(new GetSaleQuery({ saleId: sale.id.value }));

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();

      // Ensure it is a plain serializable object, not the domain Sale aggregate instance
      expect(dto).not.toBeInstanceOf(Sale);
      expect(typeof dto.id).toBe('string');
      expect(dto.id).toBe(sale.id.value);

      // Verify canonical structured monetary representations
      expect(dto.subtotal.cents).toBe(1500); // (2 * 5.50 = 11.00) + 4.00 = 15.00
      expect(dto.subtotal.amount).toBe(15.0);
      expect(dto.subtotal.currency).toBe('USD');
      expect(dto.total.cents).toBe(1260); // 15.00 - 1.00 (line) = 14.00; 10% of 14.00 = 1.40; total = 12.60
      expect(dto.total.amount).toBe(12.6);

      // Verify flat numeric summaries (ADR-0114 Section 5.5)
      expect(dto.subtotalAmount).toBe(15.0);
      expect(dto.discountTotalAmount).toBe(2.4); // 1.00 line + 1.40 order = 2.40
      expect(dto.totalAmount).toBe(12.6);

      // Verify serializable ISO timestamp strings
      expect(typeof dto.createdAt).toBe('string');
      expect(typeof dto.updatedAt).toBe('string');
    });
  });

  describe('4. Boundary Evaluation: Required Information Included without Coupling', () => {
    it('includes complete SaleItems with line totals and line discounts', async () => {
      const sale = seedSampleSale('sale_items_test_01');

      const result = await handler.execute(new GetSaleQuery({ saleId: sale.id.value }));

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.items).toHaveLength(2);

      // Item 1
      const item1 = dto.items[0]!;
      expect(item1.description).toBe('Protein Shake (Chocolate)');
      expect(item1.skuOrCode).toBe('SKU-SHAKE-01');
      expect(item1.quantity).toBe(2);
      expect(item1.unitPrice.amount).toBe(5.5);
      expect(item1.subtotal.amount).toBe(11.0);
      expect(item1.discount).toBeDefined();
      expect(item1.discount?.type).toBe('FIXED');
      expect(item1.discount?.value).toBe(1.0);
      expect(item1.discount?.reason).toBe('$1 Line Off');
      expect(item1.discountTotal.amount).toBe(1.0);
      expect(item1.total.amount).toBe(10.0);

      // Item 2
      const item2 = dto.items[1]!;
      expect(item2.description).toBe('Isotonic Electrolyte Drink');
      expect(item2.skuOrCode).toBe('SKU-DRINK-02');
      expect(item2.quantity).toBe(1);
      expect(item2.unitPrice.amount).toBe(4.0);
      expect(item2.subtotal.amount).toBe(4.0);
      expect(item2.discount).toBeNull();
      expect(item2.discountTotal.amount).toBe(0.0);
      expect(item2.total.amount).toBe(4.0);
    });

    it('includes order-level discount and total discount breakdown', async () => {
      const sale = seedSampleSale('sale_discounts_test_01');

      const result = await handler.execute(new GetSaleQuery({ saleId: sale.id.value }));

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.orderDiscount).toBeDefined();
      expect(dto.orderDiscount?.type).toBe('PERCENTAGE');
      expect(dto.orderDiscount?.value).toBe(10);
      expect(dto.orderDiscount?.reason).toBe('10% Cart Coupon');
      expect(dto.discountTotal.amount).toBe(2.4);
    });

    it('includes commercial origin SourceReference / SaleSource context', async () => {
      const sale = seedSampleSale('sale_source_test_01');

      const result = await handler.execute(new GetSaleQuery({ saleId: sale.id.value }));

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.source).toBeDefined();
      expect(dto.source.sourceType).toBe('FOOD');
      expect(dto.source.sourceId).toBe('pos_terminal_01');
      expect(dto.sourceReference).toBeDefined();
      expect(dto.sourceReference?.sourceType).toBe('FOOD');
    });

    it('includes client reference by identity only (clientId) without loading Client aggregate', async () => {
      const sale = seedSampleSale('sale_client_test_01');

      const result = await handler.execute(new GetSaleQuery({ saleId: sale.id.value }));

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      // Weak identity reference as mandated by DDD
      expect(dto.clientId).toBe('client_vip_999');
    });

    it('does NOT eagerly load unrelated aggregates (Payment, Receipt)', async () => {
      const sale = seedSampleSale('sale_isolation_test_01');

      const result = await handler.execute(new GetSaleQuery({ saleId: sale.id.value }));

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue() as unknown as Record<string, unknown>;

      // Ensure no accidental coupling to Payment or Receipt aggregates
      expect(dto['payments']).toBeUndefined();
      expect(dto['receipt']).toBeUndefined();
      expect(dto['paymentSummary']).toBeUndefined();
    });
  });

  describe('5. Read-Only Invariant (No Business Rules or Mutation in Query)', () => {
    it('executes without mutating the aggregate or performing database writes', async () => {
      const sale = seedSampleSale('sale_readonly_01');

      const result = await handler.execute(new GetSaleQuery({ saleId: sale.id.value }));

      expect(result.isSuccess).toBe(true);
      // Query invariant: Zero repository save calls
      expect(saleRepo.saveCallCount).toBe(0);
      expect(sale.getUncommittedEvents()).toHaveLength(0);
    });

    it('works identically via GetSaleByIdQuery backward-compatible alias', async () => {
      const sale = seedSampleSale('sale_alias_test_01');

      const result = await handler.execute(new GetSaleByIdQuery({ saleId: sale.id.value }));

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().id).toBe(sale.id.value);
    });
  });
});
