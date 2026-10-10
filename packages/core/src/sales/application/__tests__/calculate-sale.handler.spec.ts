import { CalculateSaleHandler } from '../queries/calculate-sale.handler';
import { CalculateSaleQuery, CalculateSaleCommand } from '../queries/calculate-sale.query';
import { SaleRepositoryPort } from '../ports/sale-repository.port';
import { Sale } from '../../domain/sale.aggregate';
import { SaleId } from '../../domain/value-objects/sale-id.vo';
import { SaleSource } from '../../domain/value-objects/sale-source.vo';
import { Money } from '../../domain/value-objects/money.vo';
import { Discount } from '../../domain/value-objects/discount.vo';
import { SaleStatus } from '../../domain/enums/sale-status.enum';
import { SaleSourceType } from '../../domain/enums/sale-source-type.enum';
import { DeterministicClock } from '../../domain/shared/clock';
import { SaleNotFoundException } from '../exceptions/sale-not-found.exception';
import { SaleUnauthorizedException } from '../exceptions/sale-unauthorized.exception';
import { SaleAlreadyFinalizedException } from '../../domain/exceptions/sale-already-finalized.exception';
import { InvalidSaleStateException } from '../../domain/exceptions/invalid-sale-state.exception';

class InMemorySaleRepository implements SaleRepositoryPort {
  public store = new Map<string, Sale>();
  public saveCallCount = 0;
  public throwOnSave?: Error;

  async findById(id: SaleId | string): Promise<Sale | null> {
    const key = typeof id === 'string' ? id.trim() : id.value;
    return this.store.get(key) ?? null;
  }

  async save(sale: Sale): Promise<void> {
    this.saveCallCount++;
    if (this.throwOnSave) {
      throw this.throwOnSave;
    }
    this.store.set(sale.id.value, sale);
  }

  clear(): void {
    this.store.clear();
    this.saveCallCount = 0;
    this.throwOnSave = undefined;
  }
}

function getErrorMessage(result: { getError(): Error | string | null }): string {
  const err = result.getError();
  return err instanceof Error ? err.message : String(err ?? '');
}

describe('CalculateSaleHandler Specification (Milestone 7.11, 7.4 & ADR-0132)', () => {
  const fixedNow = new Date('2026-10-04T14:00:00.000Z');
  let clock: DeterministicClock;
  let saleRepo: InMemorySaleRepository;
  let handler: CalculateSaleHandler;

  beforeEach(() => {
    clock = new DeterministicClock(fixedNow);
    saleRepo = new InMemorySaleRepository();
    handler = new CalculateSaleHandler(saleRepo);
  });

  const createSaleWithItems = (
    items: Array<{
      description: string;
      quantity: number;
      unitPriceAmount: number;
      discount?: Discount | null;
    }>,
    orderDiscount?: Discount | null,
    saleIdStr = 'sale_calc_test_01',
  ): Sale => {
    const sale = Sale.create(
      {
        id: SaleId.create(saleIdStr),
        currency: 'USD',
        tenantId: 'tenant_kinergy_main',
        clientId: 'client_01',
        source: SaleSource.create(SaleSourceType.FOOD, 'pos_station_1'),
        orderDiscount: orderDiscount ?? undefined,
      },
      clock,
    );

    for (const item of items) {
      sale.addItem(
        {
          source: SaleSource.create(SaleSourceType.FOOD, 'food_stock'),
          description: item.description,
          quantity: item.quantity,
          unitPrice: Money.create(item.unitPriceAmount, 'USD'),
          discount: item.discount,
        },
        clock,
      );
    }

    saleRepo.store.set(sale.id.value, sale);
    return sale;
  };

  describe('1. Delegation Proof (No Reimplementation in Application Layer)', () => {
    it('delegates calculation strictly to sale.calculateTotals() on the loaded aggregate', async () => {
      const sale = createSaleWithItems([
        { description: 'Gym Towel', quantity: 2, unitPriceAmount: 25.0 },
      ]);
      const calculateTotalsSpy = jest.spyOn(sale, 'calculateTotals');

      const query = new CalculateSaleQuery({ saleId: sale.id.value });
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      expect(calculateTotalsSpy).toHaveBeenCalledTimes(1);

      // Verify authoritative totals match domain calculations
      const dto = result.getValue();
      expect(dto.saleId).toBe(sale.id.value);
      expect(dto.currency).toBe('USD');
      expect(dto.subtotal.amount).toBe(50.0);
      expect(dto.subtotal.cents).toBe(5000);
      expect(dto.discountTotal.amount).toBe(0.0);
      expect(dto.discountTotal.cents).toBe(0);
      expect(dto.total.amount).toBe(50.0);
      expect(dto.total.cents).toBe(5000);
      expect(dto.itemCount).toBe(1);
    });
  });

  describe('2. Authoritative Domain Financial Calculations (Milestone 7.4 Reconciliation)', () => {
    it('returns authoritative composite totals with line discounts and order discount', async () => {
      // Item 1: 2 units @ $50.00 = $100.00, line discount = $15.00 -> net line = $85.00
      // Item 2: 1 unit @ $40.00 = $40.00, no discount -> net line = $40.00
      // Gross Subtotal = $140.00
      // Line Discounts = $15.00
      // Net Pre-Order Subtotal = $140.00 - $15.00 = $125.00
      // Order Discount = 10% on $125.00 = $12.50
      // Total Discounts = $15.00 + $12.50 = $27.50 (cents: 2750)
      // Total = $140.00 - $27.50 = $112.50 (cents: 11250)
      const lineDiscount = Discount.fixed(15.0, '$15 Line Reward');
      const orderDiscount = Discount.percentage(10, 'VIP 10% Cart');

      const sale = createSaleWithItems(
        [
          {
            description: 'Locker Rental',
            quantity: 2,
            unitPriceAmount: 50.0,
            discount: lineDiscount,
          },
          { description: 'Protein Shake', quantity: 1, unitPriceAmount: 40.0 },
        ],
        orderDiscount,
      );

      const query = new CalculateSaleQuery({ saleId: sale.id.value });
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.subtotal.cents).toBe(14000);
      expect(dto.subtotal.amount).toBe(140.0);
      expect(dto.discountTotal.cents).toBe(2750);
      expect(dto.discountTotal.amount).toBe(27.5);
      expect(dto.total.cents).toBe(11250);
      expect(dto.total.amount).toBe(112.5);
      expect(dto.subtotalAmount).toBe(140.0);
      expect(dto.discountTotalAmount).toBe(27.5);
      expect(dto.totalAmount).toBe(112.5);
      expect(dto.itemCount).toBe(2);
      expect(dto.orderDiscount?.type).toBe('PERCENTAGE');
      expect(dto.orderDiscount?.value).toBe(10);
      expect(dto.orderDiscount?.reason).toBe('VIP 10% Cart');
    });

    it('returns exact Commercial Half-Up rounding from domain without float drift', async () => {
      // 1 unit @ $33.33, order discount 15%
      // 3333 cents * 0.15 = 499.95 -> rounds half-up to 500 cents ($5.00)
      // Total = 3333 - 500 = 2833 cents ($28.33)
      const sale = createSaleWithItems(
        [{ description: 'Kinesiology Tape', quantity: 1, unitPriceAmount: 33.33 }],
        Discount.percentage(15),
      );

      const query = new CalculateSaleQuery({ saleId: sale.id.value });
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      const dto = result.getValue();
      expect(dto.subtotal.cents).toBe(3333);
      expect(dto.discountTotal.cents).toBe(500);
      expect(dto.total.cents).toBe(2833);
      expect(dto.total.amount).toBe(28.33);
    });
  });

  describe('3. Persistence Architecture (Side-Effect-Free Query Invariant)', () => {
    it('does NOT persist or write to repository during CalculateSale execution', async () => {
      const sale = createSaleWithItems([
        { description: 'Energy Bar', quantity: 3, unitPriceAmount: 4.5 },
      ]);

      const initialSaveCount = saleRepo.saveCallCount;

      const query = new CalculateSaleQuery({ saleId: sale.id.value });
      const result = await handler.execute(query);

      expect(result.isSuccess).toBe(true);
      // Query invariant: Zero repository save calls
      expect(saleRepo.saveCallCount).toBe(initialSaveCount);
      expect(saleRepo.saveCallCount).toBe(0);
    });

    it('works identically via CalculateSaleCommand alias', async () => {
      const sale = createSaleWithItems([
        { description: 'Water Bottle', quantity: 1, unitPriceAmount: 12.0 },
      ]);

      const command = new CalculateSaleCommand({ saleId: sale.id.value });
      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().total.amount).toBe(12.0);
      expect(saleRepo.saveCallCount).toBe(0);
    });
  });

  describe('4. Lifecycle State Restrictions (Domain Governed)', () => {
    it('fails when Sale is CANCELLED because commercial terms freeze outside DRAFT', async () => {
      const sale = createSaleWithItems([
        { description: 'Pre-workout', quantity: 1, unitPriceAmount: 30.0 },
      ]);
      sale.cancel('Member changed mind', clock);
      await saleRepo.save(sale);

      const query = new CalculateSaleQuery({ saleId: sale.id.value });
      const result = await handler.execute(query);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);
      expect(getErrorMessage(result)).toContain(
        `Cannot mutate Sale '${sale.id.value}' in status 'CANCELLED'. Commercial terms freeze upon leaving DRAFT.`,
      );
    });

    it('fails when Sale is in PENDING_PAYMENT status', async () => {
      const sale = createSaleWithItems([
        { description: 'Gym Pass', quantity: 1, unitPriceAmount: 50.0 },
      ]);
      sale.finalize(clock);
      await saleRepo.save(sale);
      expect(sale.status).toBe(SaleStatus.PENDING_PAYMENT);

      const query = new CalculateSaleQuery({ saleId: sale.id.value });
      const result = await handler.execute(query);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);
      expect(getErrorMessage(result)).toContain(
        `Cannot mutate Sale '${sale.id.value}' in status 'PENDING_PAYMENT'`,
      );
    });

    it('fails when Sale is in PAID status', async () => {
      const sale = createSaleWithItems([
        { description: 'Personal Training', quantity: 1, unitPriceAmount: 100.0 },
      ]);
      sale.finalize(clock);
      sale.markPaid(clock);
      await saleRepo.save(sale);
      expect(sale.status).toBe(SaleStatus.PAID);

      const query = new CalculateSaleQuery({ saleId: sale.id.value });
      const result = await handler.execute(query);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleAlreadyFinalizedException);
      expect(getErrorMessage(result)).toContain(
        `Cannot mutate Sale '${sale.id.value}' in status 'PAID'`,
      );
    });
  });

  describe('5. Application-Level Structural Validation & Not Found', () => {
    it('returns failure when query or input is null/undefined', async () => {
      const result = await handler.execute(null as unknown as CalculateSaleQuery);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      expect(getErrorMessage(result)).toContain('CalculateSale input cannot be null or undefined.');
    });

    it('returns failure when saleId is empty or whitespace', async () => {
      const result = await handler.execute(new CalculateSaleQuery({ saleId: '   ' }));

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(InvalidSaleStateException);
      expect(getErrorMessage(result)).toContain('Sale ID cannot be empty or whitespace.');
    });

    it('returns SaleNotFoundException when sale does not exist in repository', async () => {
      const nonExistentId = 'sale_missing_404';

      const result = await handler.execute(new CalculateSaleQuery({ saleId: nonExistentId }));

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
      expect(getErrorMessage(result)).toContain(`Sale with ID '${nonExistentId}' was not found.`);
    });
  });

  describe('6. Authorization, Multi-Tenant Boundary & Ownership Enforcement (ADR-0135)', () => {
    it('authorizes caller with sales.read permission', async () => {
      const sale = createSaleWithItems(
        [{ description: 'Towel', quantity: 1, unitPriceAmount: 10.0 }],
        null,
        'sale_calc_auth_01',
      );

      const result = await handler.execute(
        new CalculateSaleQuery({
          saleId: sale.id.value,
          tenantId: 'tenant_kinergy_main',
          currentUser: {
            id: 'user_frontdesk',
            tenantId: 'tenant_kinergy_main',
            roles: ['Receptionist'],
            permissions: ['sales.read'],
          },
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().totalAmount).toBe(10.0);
    });

    it('rejects caller lacking sales.read permission with SaleUnauthorizedException', async () => {
      const sale = createSaleWithItems(
        [{ description: 'Towel', quantity: 1, unitPriceAmount: 10.0 }],
        null,
        'sale_calc_unauth_01',
      );

      const result = await handler.execute(
        new CalculateSaleQuery({
          saleId: sale.id.value,
          tenantId: 'tenant_kinergy_main',
          currentUser: {
            id: 'user_intruder',
            tenantId: 'tenant_kinergy_main',
            roles: ['Kitchen Staff'],
            permissions: ['kitchen.orders.manage'],
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleUnauthorizedException);
    });

    it('rejects cross-tenant probing with SaleNotFoundException (uniform 404 per ADR-0135 §9)', async () => {
      const sale = createSaleWithItems(
        [{ description: 'Towel', quantity: 1, unitPriceAmount: 10.0 }],
        null,
        'sale_calc_tenant_01',
      );

      const result = await handler.execute(
        new CalculateSaleQuery({
          saleId: sale.id.value,
          tenantId: 'tenant_competitor',
          currentUser: {
            id: 'user_other_manager',
            tenantId: 'tenant_competitor',
            roles: ['Manager'],
            permissions: ['sales.read'],
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
    });

    it('allows client to calculate their own sale', async () => {
      const sale = createSaleWithItems(
        [{ description: 'Towel', quantity: 1, unitPriceAmount: 10.0 }],
        null,
        'sale_calc_client_own',
      );

      const result = await handler.execute(
        new CalculateSaleQuery({
          saleId: sale.id.value,
          tenantId: 'tenant_kinergy_main',
          currentUser: {
            id: 'client_01', // Matches sale.clientId
            tenantId: 'tenant_kinergy_main',
            roles: ['Client'],
            permissions: ['sales.read'],
          },
        }),
      );

      expect(result.isSuccess).toBe(true);
      expect(result.getValue().totalAmount).toBe(10.0);
    });

    it('strictly rejects client from calculating another client sale (Object-Level Ownership Boundary)', async () => {
      const sale = createSaleWithItems(
        [{ description: 'Towel', quantity: 1, unitPriceAmount: 10.0 }],
        null,
        'sale_calc_client_other',
      );

      const result = await handler.execute(
        new CalculateSaleQuery({
          saleId: sale.id.value,
          tenantId: 'tenant_kinergy_main',
          currentUser: {
            id: 'different_client_99',
            tenantId: 'tenant_kinergy_main',
            roles: ['Client'],
            permissions: ['sales.read'],
          },
        }),
      );

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toBeInstanceOf(SaleNotFoundException);
    });
  });
});
