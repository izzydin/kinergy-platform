import { Sale } from '../../domain/sale.aggregate';
import { Money } from '../../domain/value-objects/money.vo';
import { Discount } from '../../domain/value-objects/discount.vo';
import { SourceReference } from '../../domain/value-objects/source-reference.vo';
import { SourceType } from '../../domain/enums/source-type.enum';
import { MoneyMapper } from '../mappers/money.mapper';
import { SaleMapper } from '../mappers/sale.mapper';

describe('Phase 7.4.5: Sales Application Monetary Serialization Spec', () => {
  const defaultSource = SourceReference.create({
    sourceType: SourceType.INVENTORY_ITEM,
    sourceId: 'inv_item_1',
    sourceCode: 'PROTEIN_1KG',
  });

  describe('MoneyMapper Serialization', () => {
    it('serializes zero money deterministically with exact zero cents and trailing zeroes', () => {
      const zeroMoney = Money.zero('USD');
      const dto = MoneyMapper.toDTO(zeroMoney);

      expect(dto).toEqual({
        amount: 0,
        currency: 'USD',
        formatted: '0.00',
        cents: 0,
      });
    });

    it('serializes standard decimal money without floating-point artifacts', () => {
      const money = Money.create(49.99, 'USD');
      const dto = MoneyMapper.toDTO(money);

      expect(dto).toEqual({
        amount: 49.99,
        currency: 'USD',
        formatted: '49.99',
        cents: 4999,
      });
    });

    it('preserves trailing zeroes for round dollar and ten-cent amounts', () => {
      const wholeDollars = Money.create(10.0, 'USD');
      const dtoWhole = MoneyMapper.toDTO(wholeDollars);

      expect(dtoWhole.amount).toBe(10);
      expect(dtoWhole.formatted).toBe('10.00');
      expect(dtoWhole.cents).toBe(1000);

      const fiftyCents = Money.create(10.5, 'USD');
      const dtoFifty = MoneyMapper.toDTO(fiftyCents);

      expect(dtoFifty.amount).toBe(10.5);
      expect(dtoFifty.formatted).toBe('10.50');
      expect(dtoFifty.cents).toBe(1050);
    });

    it('serializes maximum boundary amount ($9,999,999,999.99) without precision loss', () => {
      const maxMoney = Money.fromCents(999999999999, 'USD');
      const dto = MoneyMapper.toDTO(maxMoney);

      expect(dto.cents).toBe(999999999999);
      expect(dto.formatted).toBe('9999999999.99');
      expect(dto.amount).toBe(9999999999.99);
      expect(dto.currency).toBe('USD');
    });

    it('reconstitutes domain Money from DTO without precision loss', () => {
      const original = Money.create('89.95', 'EUR');
      const dto = MoneyMapper.toDTO(original);
      const reconstituted = MoneyMapper.toDomain(dto);

      expect(reconstituted.equals(original)).toBe(true);
      expect(reconstituted.cents).toBe(8995);
      expect(reconstituted.currency).toBe('EUR');
    });

    it('reconstitutes domain Money from cents accurately', () => {
      const reconstituted = MoneyMapper.toDomain({ cents: 4500, currency: 'USD' });
      expect(reconstituted.cents).toBe(4500);
      expect(reconstituted.amount).toBe(45.0);
      expect(reconstituted.toString()).toBe('45.00 USD');
    });
  });

  describe('Sale and SaleItem DTO Serialization Fidelity', () => {
    it('serializes empty draft sale with exact zero monetary totals', () => {
      const sale = Sale.create({ currency: 'USD', source: defaultSource });
      const dto = SaleMapper.toDTO(sale);

      expect(dto.subtotal).toEqual({
        amount: 0,
        currency: 'USD',
        formatted: '0.00',
        cents: 0,
      });
      expect(dto.discountTotal).toEqual({
        amount: 0,
        currency: 'USD',
        formatted: '0.00',
        cents: 0,
      });
      expect(dto.total).toEqual({
        amount: 0,
        currency: 'USD',
        formatted: '0.00',
        cents: 0,
      });

      // Flat summary projections
      expect(dto.subtotalAmount).toBe(0);
      expect(dto.discountTotalAmount).toBe(0);
      expect(dto.totalAmount).toBe(0);
      expect(dto.currency).toBe('USD');
      expect(dto.itemCount).toBe(0);
      expect(dto.items).toEqual([]);
    });

    it('serializes complimentary promotional line item ($0.00 unit price)', () => {
      const sale = Sale.create({ currency: 'USD', source: defaultSource });
      sale.addItem({
        source: defaultSource,
        description: 'Free Promotional Sample',
        quantity: 1,
        unitPrice: Money.zero('USD'),
      });

      const dto = SaleMapper.toDTO(sale);
      expect(dto.itemCount).toBe(1);
      const item0 = dto.items[0]!;
      expect(item0.unitPrice.cents).toBe(0);
      expect(item0.unitPrice.formatted).toBe('0.00');
      expect(item0.subtotal.cents).toBe(0);
      expect(item0.subtotal.formatted).toBe('0.00');
      expect(item0.total.cents).toBe(0);
      expect(item0.total.formatted).toBe('0.00');
      expect(dto.total.cents).toBe(0);
      expect(dto.total.formatted).toBe('0.00');
    });

    it('serializes fractional quantities and percentage discounts with exact cent precision', () => {
      const sale = Sale.create({ currency: 'USD', source: defaultSource });
      // 1.250 kg @ $24.50/kg -> subtotal = $30.63
      sale.addItem({
        source: defaultSource,
        description: 'Bulk Protein Powder (1.25 kg)',
        quantity: 1.25,
        unitPrice: Money.create(24.5, 'USD'),
      });

      const itemId = sale.items[0]!.id;
      // 10% discount on $30.63 -> $3.06 discount -> net = $27.57
      sale.applyItemDiscount(itemId, Discount.percentage(10, 'VIP 10% Discount'));

      const dto = SaleMapper.toDTO(sale);
      const itemDto = dto.items[0]!;

      // Item assertions
      expect(itemDto.quantity).toBe(1.25);
      expect(itemDto.unitPrice.formatted).toBe('24.50');
      expect(itemDto.unitPriceAmount).toBe(24.5);
      expect(itemDto.subtotal.cents).toBe(3063);
      expect(itemDto.subtotal.formatted).toBe('30.63');
      expect(itemDto.subtotalAmount).toBe(30.63);

      expect(itemDto.discount).toEqual({
        type: 'PERCENTAGE',
        value: 10,
        reason: 'VIP 10% Discount',
      });
      expect(itemDto.discountTotal.cents).toBe(306);
      expect(itemDto.discountTotal.formatted).toBe('3.06');
      expect(itemDto.discountTotalAmount).toBe(3.06);

      expect(itemDto.total.cents).toBe(2757);
      expect(itemDto.total.formatted).toBe('27.57');
      expect(itemDto.totalAmount).toBe(27.57);

      // Aggregate assertions
      expect(dto.subtotal.cents).toBe(3063);
      expect(dto.subtotal.formatted).toBe('30.63');
      expect(dto.subtotalAmount).toBe(30.63);

      expect(dto.discountTotal.cents).toBe(306);
      expect(dto.discountTotal.formatted).toBe('3.06');
      expect(dto.discountTotalAmount).toBe(3.06);

      expect(dto.total.cents).toBe(2757);
      expect(dto.total.formatted).toBe('27.57');
      expect(dto.totalAmount).toBe(27.57);
    });

    it('serializes multi-item order with mixed fixed and percentage discounts without penny drift', () => {
      const sale = Sale.create({ currency: 'USD', source: defaultSource });

      // Item 1: 3 x $19.99 = $59.97, $10.00 fixed discount -> net $49.97
      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.INVENTORY_ITEM,
          sourceId: 'item_1',
          sourceCode: 'SHIRT',
        }),
        description: 'Gym Athletic Shirt',
        quantity: 3,
        unitPrice: Money.create(19.99, 'USD'),
      });
      const item1Id = sale.items[0]!.id;
      sale.applyItemDiscount(item1Id, Discount.fixed(10.0, 'Staff voucher'));

      // Item 2: 1 x $49.99 = $49.99, 15% discount ($7.50) -> net $42.49
      sale.addItem({
        source: SourceReference.create({
          sourceType: SourceType.MEMBERSHIP_PLAN,
          sourceId: 'plan_1',
          sourceCode: 'MONTHLY',
        }),
        description: 'Monthly Pass',
        quantity: 1,
        unitPrice: Money.create(49.99, 'USD'),
      });
      const item2Id = sale.items[1]!.id;
      sale.applyItemDiscount(item2Id, Discount.percentage(15, '15% Promo'));

      // Subtotal = 59.97 + 49.99 = 109.96
      // Discount = 10.00 + 7.50 = 17.50
      // Total = 109.96 - 17.50 = 92.46
      const dto = SaleMapper.toDTO(sale);

      expect(dto.subtotal.cents).toBe(10996);
      expect(dto.subtotal.formatted).toBe('109.96');
      expect(dto.subtotalAmount).toBe(109.96);

      expect(dto.discountTotal.cents).toBe(1750);
      expect(dto.discountTotal.formatted).toBe('17.50');
      expect(dto.discountTotalAmount).toBe(17.5);

      expect(dto.total.cents).toBe(9246);
      expect(dto.total.formatted).toBe('92.46');
      expect(dto.totalAmount).toBe(92.46);

      // Domain value -> API response assertion
      expect(sale.subtotal.cents).toBe(dto.subtotal.cents);
      expect(sale.discountTotal.cents).toBe(dto.discountTotal.cents);
      expect(sale.total.cents).toBe(dto.total.cents);
    });

    it('serializes lightweight SaleSummaryDTO matching full DTO financial values', () => {
      const sale = Sale.create({ currency: 'USD', source: defaultSource, tenantId: 'tenant_123' });
      sale.addItem({
        source: defaultSource,
        description: 'Energy Bar',
        quantity: 4,
        unitPrice: Money.create(2.5, 'USD'),
      });

      const fullDto = SaleMapper.toDTO(sale);
      const summaryDto = SaleMapper.toSummaryDTO(sale);

      expect(summaryDto.id).toBe(fullDto.id);
      expect(summaryDto.tenantId).toBe('tenant_123');
      expect(summaryDto.currency).toBe('USD');
      expect(summaryDto.subtotal).toEqual(fullDto.subtotal);
      expect(summaryDto.discountTotal).toEqual(fullDto.discountTotal);
      expect(summaryDto.total).toEqual(fullDto.total);
      expect(summaryDto.subtotalAmount).toBe(fullDto.subtotalAmount);
      expect(summaryDto.discountTotalAmount).toBe(fullDto.discountTotalAmount);
      expect(summaryDto.totalAmount).toBe(fullDto.totalAmount);
      expect(summaryDto.itemCount).toBe(1);
    });

    it('produces deterministic repeated responses across multiple serialization cycles', () => {
      const sale = Sale.create({ currency: 'USD', source: defaultSource });
      sale.addItem({
        source: defaultSource,
        description: 'Session Pack',
        quantity: 5,
        unitPrice: Money.create(85.0, 'USD'),
      });

      const response1 = SaleMapper.toDTO(sale);
      const response2 = SaleMapper.toDTO(sale);
      const response3 = SaleMapper.toDTO(sale);

      expect(response1).toEqual(response2);
      expect(response2).toEqual(response3);
      expect(JSON.stringify(response1)).toBe(JSON.stringify(response2));
    });

    it('ensures JSON stringification and parsing round-trips with zero precision loss', () => {
      const sale = Sale.create({ currency: 'USD', source: defaultSource });
      sale.addItem({
        source: defaultSource,
        description: 'Therapy Lotion',
        quantity: 2,
        unitPrice: Money.create(14.99, 'USD'),
      });

      const dto = SaleMapper.toDTO(sale);
      const serialized = JSON.stringify(dto);
      const parsed = JSON.parse(serialized);

      expect(parsed.subtotal.amount).toBe(29.98);
      expect(parsed.subtotal.formatted).toBe('29.98');
      expect(parsed.subtotal.cents).toBe(2998);
      expect(parsed.subtotalAmount).toBe(29.98);
      expect(parsed.total.amount).toBe(29.98);
      expect(parsed.total.formatted).toBe('29.98');
      expect(parsed.total.cents).toBe(2998);
      expect(parsed.totalAmount).toBe(29.98);
    });

    it('does not leak Prisma or ORM classes into the DTO', () => {
      const sale = Sale.create({ currency: 'USD', source: defaultSource });
      sale.addItem({
        source: defaultSource,
        description: 'Item',
        quantity: 1,
        unitPrice: Money.create(10, 'USD'),
      });

      const dto = SaleMapper.toDTO(sale);
      const json = JSON.stringify(dto);

      expect(json).not.toContain('Decimal');
      expect(json).not.toContain('Prisma');
    });
  });
});
