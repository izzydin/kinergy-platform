import { Sale } from '../../domain/sale.aggregate';
import { Money } from '../../domain/value-objects/money.vo';
import { Discount } from '../../domain/value-objects/discount.vo';
import { SourceReference } from '../../domain/value-objects/source-reference.vo';
import { SourceType } from '../../domain/enums/source-type.enum';
import { SaleStatus } from '../../domain/enums/sale-status.enum';
import { DeterministicClock } from '../../domain/shared/clock';
import { MoneyMapper } from '../mappers/money.mapper';
import { SaleMapper } from '../mappers/sale.mapper';
import { SaleDTO, SaleSummaryDTO, SaleTotalsDTO, PaginatedResultDTO } from '../dtos';
import {
  CreateSaleCommand,
  CreateSaleInput,
  AddSaleItemCommand,
  AddSaleItemInput,
  RemoveSaleItemCommand,
  RemoveSaleItemInput,
  ApplyDiscountCommand,
  ApplyDiscountInput,
  CancelSaleCommand,
  CancelSaleInput,
} from '../commands';
import {
  GetSaleQuery,
  GetSaleInput,
  ListSalesQuery,
  ListSalesInput,
  CalculateSaleQuery,
  CalculateSaleInput,
} from '../queries';

describe('Phase 7.11: Sale Use Cases Input & Output Contracts Specification', () => {
  const clock = new DeterministicClock(new Date('2026-10-01T12:00:00.000Z'));

  const validSource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv-item-001',
    sourceCode: 'SKU-SHAKE-01',
  });

  function createSampleSale(): Sale {
    const sale = Sale.create(
      {
        tenantId: 'tenant-123',
        clientId: 'client-456',
        currency: 'USD',
        source: validSource,
      },
      clock,
    );

    sale.addItem({
      source: validSource,
      description: 'Protein Shake',
      skuOrCode: 'SKU-SHAKE-01',
      quantity: 2,
      unitPrice: Money.create(15.5, 'USD'),
    });

    return sale;
  }

  describe('Command Input Contracts (Pure Application Intent)', () => {
    it('CreateSaleCommand accepts well-formed CreateSaleInput without Prisma types', () => {
      const input: CreateSaleInput = {
        tenantId: 'tenant-123',
        clientId: 'client-456',
        currency: 'USD',
        source: {
          sourceType: 'INVENTORY_ITEM',
          sourceId: 'inv-item-001',
          sourceCode: 'SKU-001',
        },
        items: [
          {
            description: 'Item 1',
            quantity: 1,
            unitPriceAmount: 25.0,
            discount: {
              type: 'PERCENTAGE',
              value: 10,
              reason: 'Promo',
            },
          },
        ],
        orderDiscount: {
          type: 'FIXED',
          value: 5.0,
          reason: 'VIP',
        },
      };

      const cmd = new CreateSaleCommand(input);
      expect(cmd.input).toBe(input);
      expect(cmd.input.items?.[0]?.unitPriceAmount).toBe(25.0);
      expect(typeof cmd.input.items?.[0]?.unitPriceAmount).toBe('number');
    });

    it('AddSaleItemCommand encapsulates line item addition intent', () => {
      const input: AddSaleItemInput = {
        saleId: 'sale-001',
        description: 'New Supplement',
        quantity: 3,
        unitPriceAmount: 12.5,
        skuOrCode: 'SUP-002',
        source: {
          sourceType: 'INVENTORY_ITEM',
          sourceId: 'inv-002',
        },
        discount: {
          type: 'FIXED',
          value: 2.0,
        },
      };

      const cmd = new AddSaleItemCommand(input);
      expect(cmd.input.saleId).toBe('sale-001');
      expect(cmd.input.quantity).toBe(3);
      expect(cmd.input.unitPriceAmount).toBe(12.5);
    });

    it('RemoveSaleItemCommand encapsulates item removal intent', () => {
      const input: RemoveSaleItemInput = {
        saleId: 'sale-001',
        itemId: 'item-002',
      };

      const cmd = new RemoveSaleItemCommand(input);
      expect(cmd.input.saleId).toBe('sale-001');
      expect(cmd.input.itemId).toBe('item-002');
    });

    it('ApplyDiscountCommand encapsulates discount intent for percentage and fixed types', () => {
      const fixedInput: ApplyDiscountInput = {
        saleId: 'sale-001',
        discount: {
          type: 'FIXED',
          value: 10.0,
          reason: 'Manager Override',
        },
      };
      const cmdFixed = new ApplyDiscountCommand(fixedInput);
      expect(cmdFixed.input.discount.type).toBe('FIXED');
      expect(cmdFixed.input.discount.value).toBe(10.0);

      const percentInput: ApplyDiscountInput = {
        saleId: 'sale-001',
        discount: {
          type: 'PERCENTAGE',
          value: 15,
        },
      };
      const cmdPercent = new ApplyDiscountCommand(percentInput);
      expect(cmdPercent.input.discount.type).toBe('PERCENTAGE');
      expect(cmdPercent.input.discount.value).toBe(15);
    });

    it('CancelSaleCommand encapsulates explicit cancellation intent with reason', () => {
      const input: CancelSaleInput = {
        saleId: 'sale-001',
        reason: 'Client requested cancellation prior to payment',
        tenantId: 'tenant-123',
      };

      const cmd = new CancelSaleCommand(input);
      expect(cmd.input.saleId).toBe('sale-001');
      expect(cmd.input.reason).toBe('Client requested cancellation prior to payment');
      expect(cmd.input.tenantId).toBe('tenant-123');
    });
  });

  describe('Query Input Contracts (Pure Application Intent)', () => {
    it('GetSaleQuery accepts GetSaleInput with saleId', () => {
      const input: GetSaleInput = { saleId: 'sale-123' };
      const query = new GetSaleQuery(input);
      expect(query.input.saleId).toBe('sale-123');
    });

    it('ListSalesQuery accepts structured nested filter, pagination, and sort', () => {
      const input: ListSalesInput = {
        tenantId: 'tenant-123',
        filter: {
          clientId: 'client-456',
          status: SaleStatus.PENDING_PAYMENT,
          sourceType: 'INVENTORY_ITEM',
        },
        pagination: {
          page: 2,
          limit: 25,
        },
        sort: {
          field: 'total',
          direction: 'desc',
        },
      };

      const query = new ListSalesQuery(input);
      expect(query.input.filter?.status).toBe(SaleStatus.PENDING_PAYMENT);
      expect(query.input.pagination?.limit).toBe(25);
      expect(query.input.sort?.field).toBe('total');
    });

    it('ListSalesQuery accepts flat query parameters from URL state', () => {
      const input: ListSalesInput = {
        tenantId: 'tenant-123',
        clientId: 'client-456',
        status: 'PENDING_PAYMENT',
        page: 1,
        limit: 10,
        sortBy: 'createdAt',
        sortOrder: 'desc',
      };

      const query = new ListSalesQuery(input);
      expect(query.input.clientId).toBe('client-456');
      expect(query.input.page).toBe(1);
      expect(query.input.limit).toBe(10);
      expect(query.input.sortBy).toBe('createdAt');
    });

    it('CalculateSaleQuery accepts CalculateSaleInput with saleId', () => {
      const input: CalculateSaleInput = { saleId: 'sale-789' };
      const query = new CalculateSaleQuery(input);
      expect(query.input.saleId).toBe('sale-789');
    });
  });

  describe('Output Contracts & Mapping Fidelity', () => {
    it('SaleMapper.toDTO outputs canonical SaleDTO with MoneyDTO and zero Prisma leak', () => {
      const sale = createSampleSale();
      const dto: SaleDTO = SaleMapper.toDTO(sale);

      // Verify canonical fields
      expect(dto.id).toBe(sale.id.value);
      expect(dto.tenantId).toBe('tenant-123');
      expect(dto.clientId).toBe('client-456');
      expect(dto.currency).toBe('USD');
      expect(dto.status).toBe(SaleStatus.DRAFT);
      expect(dto.itemCount).toBe(1);
      expect(dto.items.length).toBe(1);

      // Verify canonical structured MoneyDTO
      expect(dto.subtotal).toEqual({
        amount: 31.0,
        currency: 'USD',
        formatted: '31.00',
        cents: 3100,
      });
      expect(dto.discountTotal).toEqual({
        amount: 0.0,
        currency: 'USD',
        formatted: '0.00',
        cents: 0,
      });
      expect(dto.total).toEqual({
        amount: 31.0,
        currency: 'USD',
        formatted: '31.00',
        cents: 3100,
      });

      // Verify flat summary read projections
      expect(dto.subtotalAmount).toBe(31.0);
      expect(dto.discountTotalAmount).toBe(0.0);
      expect(dto.totalAmount).toBe(31.0);

      // Verify child item mapping
      const item = dto.items[0]!;
      expect(item.description).toBe('Protein Shake');
      expect(item.quantity).toBe(2);
      expect(item.unitPrice.formatted).toBe('15.50');
      expect(item.unitPriceAmount).toBe(15.5);
      expect(item.subtotal.formatted).toBe('31.00');
      expect(item.total.formatted).toBe('31.00');

      // Verify strict absence of Prisma types
      const serialized = JSON.stringify(dto);
      expect(serialized).not.toContain('Prisma');
      expect(serialized).not.toContain('Decimal');
    });

    it('SaleMapper.toTotalsDTO produces authoritative SaleTotalsDTO for CalculateSale', () => {
      const sale = createSampleSale();
      sale.applyOrderDiscount(Discount.fixed(5.0, 'Promo'));

      const totalsDto: SaleTotalsDTO = SaleMapper.toTotalsDTO(sale);

      expect(totalsDto.saleId).toBe(sale.id.value);
      expect(totalsDto.currency).toBe('USD');
      expect(totalsDto.subtotal.formatted).toBe('31.00');
      expect(totalsDto.subtotal.cents).toBe(3100);
      expect(totalsDto.discountTotal.formatted).toBe('5.00');
      expect(totalsDto.discountTotal.cents).toBe(500);
      expect(totalsDto.total.formatted).toBe('26.00');
      expect(totalsDto.total.cents).toBe(2600);
      expect(totalsDto.itemCount).toBe(1);
      expect(totalsDto.orderDiscount?.type).toBe('FIXED');
      expect(totalsDto.orderDiscount?.value).toBe(5.0);
    });

    it('SaleMapper.toSummaryDTO produces lightweight SaleSummaryDTO for ListSales', () => {
      const sale = createSampleSale();
      const summary: SaleSummaryDTO = SaleMapper.toSummaryDTO(sale);

      expect(summary.id).toBe(sale.id.value);
      expect(summary.tenantId).toBe('tenant-123');
      expect(summary.clientId).toBe('client-456');
      expect(summary.currency).toBe('USD');
      expect(summary.status).toBe(SaleStatus.DRAFT);
      expect(summary.itemCount).toBe(1);
      expect(summary.total.formatted).toBe('31.00');
      expect(summary.totalAmount).toBe(31.0);

      // Verify lightweight shape excludes verbose item arrays
      expect((summary as unknown as { items?: unknown }).items).toBeUndefined();
    });

    it('PaginatedResultDTO<SaleSummaryDTO> satisfies pagination contract', () => {
      const sale = createSampleSale();
      const summary = SaleMapper.toSummaryDTO(sale);

      const paginatedResult: PaginatedResultDTO<SaleSummaryDTO> = {
        items: [summary],
        total: 1,
        page: 1,
        limit: 10,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      };

      expect(paginatedResult.items.length).toBe(1);
      expect(paginatedResult.total).toBe(1);
      expect(paginatedResult.page).toBe(1);
      expect(paginatedResult.limit).toBe(10);
      expect(paginatedResult.totalPages).toBe(1);
      expect(paginatedResult.items[0]?.id).toBe(sale.id.value);
    });
  });

  describe('Money Serialization Invariants', () => {
    it('MoneyMapper guarantees zero floating point precision drift', () => {
      const testCases = [
        { cents: 0, formatted: '0.00', amount: 0 },
        { cents: 99, formatted: '0.99', amount: 0.99 },
        { cents: 100, formatted: '1.00', amount: 1.0 },
        { cents: 1999, formatted: '19.99', amount: 19.99 },
        { cents: 10000000, formatted: '100000.00', amount: 100000.0 },
      ];

      for (const tc of testCases) {
        const money = Money.fromCents(tc.cents, 'USD');
        const dto = MoneyMapper.toDTO(money);

        expect(dto.cents).toBe(tc.cents);
        expect(dto.formatted).toBe(tc.formatted);
        expect(dto.amount).toBe(tc.amount);
        expect(dto.currency).toBe('USD');

        // Reconstitution check
        const reconstituted = MoneyMapper.toDomain(dto);
        expect(reconstituted.cents).toBe(tc.cents);
      }
    });

    it('MoneyMapper rejects or handles missing currency gracefully with default USD', () => {
      const reconstituted = MoneyMapper.toDomain({ cents: 2500 });
      expect(reconstituted.currency).toBe('USD');
      expect(reconstituted.cents).toBe(2500);
    });
  });
});
