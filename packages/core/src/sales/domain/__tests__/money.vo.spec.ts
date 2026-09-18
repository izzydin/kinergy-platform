import { Money } from '../value-objects/money.vo';
import { InvalidMoneyException } from '../exceptions/invalid-money.exception';

describe('Money Value Object (Milestone 7.4 Canonical Implementation)', () => {
  describe('Construction & Validation', () => {
    it('creates valid zero money via create and zero factory', () => {
      const zeroNum = Money.create(0);
      const zeroStr = Money.create('0');
      const zeroDecStr = Money.create('0.00');
      const zeroFactory = Money.zero();
      const zeroFromCents = Money.fromCents(0);

      expect(zeroNum.amount).toBe(0);
      expect(zeroNum.cents).toBe(0);
      expect(zeroNum.currency).toBe('USD');
      expect(zeroNum.isZero()).toBe(true);
      expect(zeroNum.isPositive()).toBe(false);
      expect(zeroNum.isNegative()).toBe(false);

      expect(zeroStr.cents).toBe(0);
      expect(zeroDecStr.cents).toBe(0);
      expect(zeroFactory.cents).toBe(0);
      expect(zeroFromCents.cents).toBe(0);

      expect(zeroNum.equals(zeroFactory)).toBe(true);
    });

    it('creates valid positive amounts with numbers and strings', () => {
      const moneyNum = Money.create(49.99, 'USD');
      const moneyStr = Money.create('49.99', 'USD');
      const moneyInt = Money.create(50, 'CAD');
      const moneySingleDec = Money.create('10.5', 'EUR');

      expect(moneyNum.amount).toBe(49.99);
      expect(moneyNum.cents).toBe(4999);
      expect(moneyNum.currency).toBe('USD');
      expect(moneyNum.isPositive()).toBe(true);

      expect(moneyStr.amount).toBe(49.99);
      expect(moneyStr.cents).toBe(4999);

      expect(moneyInt.amount).toBe(50.0);
      expect(moneyInt.cents).toBe(5000);
      expect(moneyInt.currency).toBe('CAD');

      expect(moneySingleDec.amount).toBe(10.5);
      expect(moneySingleDec.cents).toBe(1050);
      expect(moneySingleDec.currency).toBe('EUR');
    });

    it('creates Money from exact integer cents', () => {
      const money = Money.fromCents(1250, 'USD');
      expect(money.cents).toBe(1250);
      expect(money.amount).toBe(12.5);
      expect(money.currency).toBe('USD');
    });

    it('normalizes currency codes to uppercase and trims whitespace', () => {
      const m1 = Money.create(10, ' usd ');
      const m2 = Money.create(10, 'eur');
      expect(m1.currency).toBe('USD');
      expect(m2.currency).toBe('EUR');
    });

    it('validates exact supported precision (maximum 2 decimal places)', () => {
      expect(Money.create(0.01).cents).toBe(1);
      expect(Money.create(0.1).cents).toBe(10);
      expect(Money.create(1.99).cents).toBe(199);
      expect(Money.create('1.99').cents).toBe(199);
    });

    it('rejects unsupported precision (> 2 decimal places) for numbers and strings', () => {
      expect(() => Money.create(10.123)).toThrow(InvalidMoneyException);
      expect(() => Money.create(10.001)).toThrow(InvalidMoneyException);
      expect(() => Money.create(0.005)).toThrow(InvalidMoneyException);
      expect(() => Money.create('10.123')).toThrow(InvalidMoneyException);
      expect(() => Money.create('10.0001')).toThrow(InvalidMoneyException);
      expect(() => Money.fromCents(10.5)).toThrow(InvalidMoneyException);
    });

    it('rejects malformed values and invalid decimal representations', () => {
      expect(() => Money.create(NaN)).toThrow(InvalidMoneyException);
      expect(() => Money.create(Infinity)).toThrow(InvalidMoneyException);
      expect(() => Money.create(-Infinity)).toThrow(InvalidMoneyException);
      expect(() => Money.create(null as unknown as number)).toThrow(InvalidMoneyException);
      expect(() => Money.create(undefined as unknown as number)).toThrow(InvalidMoneyException);
      expect(() => Money.create('abc')).toThrow(InvalidMoneyException);
      expect(() => Money.create('12.34.56')).toThrow(InvalidMoneyException);
      expect(() => Money.create('$10.00')).toThrow(InvalidMoneyException);
      expect(() => Money.create('10,00')).toThrow(InvalidMoneyException);
      expect(() => Money.create('')).toThrow(InvalidMoneyException);
      expect(() => Money.create('   ')).toThrow(InvalidMoneyException);
    });

    it('rejects prohibited negative amounts by default', () => {
      expect(() => Money.create(-0.01)).toThrow(InvalidMoneyException);
      expect(() => Money.create(-5.0)).toThrow(InvalidMoneyException);
      expect(() => Money.create('-5.00')).toThrow(InvalidMoneyException);
      expect(() => Money.fromCents(-500)).toThrow(InvalidMoneyException);
    });

    it('allows negative amounts when explicitly permitted for adjustments', () => {
      const negativeNum = Money.create(-5.0, 'USD', { allowNegative: true });
      const negativeStr = Money.create('-5.00', 'USD', { allowNegative: true });
      const negativeCents = Money.fromCents(-500, 'USD', { allowNegative: true });

      expect(negativeNum.cents).toBe(-500);
      expect(negativeNum.amount).toBe(-5.0);
      expect(negativeNum.isNegative()).toBe(true);
      expect(negativeNum.isPositive()).toBe(false);
      expect(negativeNum.isZero()).toBe(false);

      expect(negativeStr.cents).toBe(-500);
      expect(negativeCents.cents).toBe(-500);
      expect(negativeNum.toString()).toBe('-5.00 USD');
    });

    it('rejects invalid currency codes', () => {
      expect(() => Money.create(10, '')).toThrow(InvalidMoneyException);
      expect(() => Money.create(10, 'US')).toThrow(InvalidMoneyException);
      expect(() => Money.create(10, 'USDT')).toThrow(InvalidMoneyException);
      expect(() => Money.create(10, '123')).toThrow(InvalidMoneyException);
      expect(() => Money.create(10, null as unknown as string)).toThrow(InvalidMoneyException);
    });
  });

  describe('Arithmetic Operations', () => {
    describe('Addition', () => {
      it('adds amounts cleanly without floating-point drift', () => {
        // Classic JS float artifact: 0.1 + 0.2 === 0.30000000000000004
        const m1 = Money.create(0.1);
        const m2 = Money.create(0.2);
        const sum = m1.add(m2);

        expect(sum.cents).toBe(30);
        expect(sum.amount).toBe(0.3);
        expect(sum.equals(Money.create(0.3))).toBe(true);
      });

      it('correctly handles zero addition (identity element)', () => {
        const m1 = Money.create(25.5, 'USD');
        const zero = Money.zero('USD');
        const sum = m1.add(zero);

        expect(sum.equals(m1)).toBe(true);
        expect(sum.cents).toBe(2550);
      });

      it('rejects addition with different currencies', () => {
        const usd = Money.create(10, 'USD');
        const eur = Money.create(10, 'EUR');
        expect(() => usd.add(eur)).toThrow(InvalidMoneyException);
      });
    });

    describe('Subtraction', () => {
      it('subtracts amounts cleanly without floating-point artifacts', () => {
        // Classic JS float artifact: 1.005 - 1.000 = 0.004999999999999893
        const m1 = Money.create(1.0);
        const m2 = Money.create(0.99);
        const diff = m1.subtract(m2);

        expect(diff.cents).toBe(1);
        expect(diff.amount).toBe(0.01);
      });

      it('subtracts to exact zero', () => {
        const m1 = Money.create(15.75, 'USD');
        const diff = m1.subtract(m1);

        expect(diff.isZero()).toBe(true);
        expect(diff.cents).toBe(0);
        expect(diff.amount).toBe(0);
      });

      it('prohibits negative resulting amount by default', () => {
        const small = Money.create(10.0, 'USD');
        const large = Money.create(15.0, 'USD');

        expect(() => small.subtract(large)).toThrow(InvalidMoneyException);
      });

      it('permits negative resulting amount when allowNegative option is passed', () => {
        const small = Money.create(10.0, 'USD');
        const large = Money.create(15.0, 'USD');
        const diff = small.subtract(large, { allowNegative: true });

        expect(diff.cents).toBe(-500);
        expect(diff.amount).toBe(-5.0);
        expect(diff.isNegative()).toBe(true);
      });

      it('rejects subtraction with different currencies', () => {
        const usd = Money.create(20, 'USD');
        const cad = Money.create(10, 'CAD');
        expect(() => usd.subtract(cad)).toThrow(InvalidMoneyException);
      });
    });

    describe('Multiplication', () => {
      it('multiplies integer units deterministically', () => {
        // Classic JS float artifact: 19.99 * 3 === 59.970000000000006
        const unitPrice = Money.create(19.99, 'USD');
        const total = unitPrice.multiply(3);

        expect(total.cents).toBe(5997);
        expect(total.amount).toBe(59.97);
      });

      it('multiplies by fractional quantities using Commercial Half-Up rounding at cent boundary', () => {
        // 1.250 kg * $24.50 = 30.625 -> Half-Up rounds to $30.63
        const unitPrice = Money.create(24.5, 'USD');
        const total = unitPrice.multiply(1.25);

        expect(total.cents).toBe(3063);
        expect(total.amount).toBe(30.63);
      });

      it('multiplies using Quantity value object shape { readonly value: number }', () => {
        const unitPrice = Money.create(10.0, 'USD');
        const qty = { value: 2.5 };
        const total = unitPrice.multiply(qty);

        expect(total.cents).toBe(2500);
        expect(total.amount).toBe(25.0);
      });

      it('multiplies by zero resulting in zero money', () => {
        const unitPrice = Money.create(100.0, 'USD');
        const total = unitPrice.multiply(0);

        expect(total.isZero()).toBe(true);
        expect(total.cents).toBe(0);
      });

      it('rejects negative or invalid multiplication factor', () => {
        const unitPrice = Money.create(10.0, 'USD');
        expect(() => unitPrice.multiply(-1)).toThrow(InvalidMoneyException);
        expect(() => unitPrice.multiply(NaN)).toThrow(InvalidMoneyException);
        expect(() => unitPrice.multiply(Infinity)).toThrow(InvalidMoneyException);
      });

      it('correctly handles midpoint epsilon rounding (0.005 -> 0.01)', () => {
        // $1.00 (100 cents) * 1.005 = 100.5 cents -> rounds UP to 101 cents ($1.01)
        const price = Money.create(1.0, 'USD');
        const roundedUp = price.multiply(1.005);
        expect(roundedUp.cents).toBe(101);

        // $1.00 (100 cents) * 1.004 = 100.4 cents -> rounds DOWN to 100 cents ($1.00)
        const roundedDown = price.multiply(1.004);
        expect(roundedDown.cents).toBe(100);
      });
    });
  });

  describe('Comparison Operations', () => {
    const ten = Money.create(10.0, 'USD');
    const twenty = Money.create(20.0, 'USD');
    const tenDuplicate = Money.create(10.0, 'USD');

    it('compares equality based on value rather than object identity', () => {
      expect(ten === tenDuplicate).toBe(false);
      expect(ten.equals(tenDuplicate)).toBe(true);
      expect(ten.compare(tenDuplicate)).toBe(0);

      expect(ten.equals(twenty)).toBe(false);
      expect(ten.equals(null)).toBe(false);
      expect(ten.equals(undefined)).toBe(false);
      expect(ten.equals('10.00 USD')).toBe(false);
      expect(ten.equals(Money.create(10.0, 'EUR'))).toBe(false);
    });

    it('correctly compares greater than and less than', () => {
      expect(twenty.greaterThan(ten)).toBe(true);
      expect(twenty.greaterThanOrEqual(ten)).toBe(true);
      expect(twenty.greaterThanOrEqual(twenty)).toBe(true);
      expect(twenty.compare(ten)).toBe(1);

      expect(ten.lessThan(twenty)).toBe(true);
      expect(ten.lessThanOrEqual(twenty)).toBe(true);
      expect(ten.lessThanOrEqual(tenDuplicate)).toBe(true);
      expect(ten.compare(twenty)).toBe(-1);
    });

    it('rejects comparison across different currencies', () => {
      const tenUsd = Money.create(10.0, 'USD');
      const tenEur = Money.create(10.0, 'EUR');

      expect(() => tenUsd.compare(tenEur)).toThrow(InvalidMoneyException);
      expect(() => tenUsd.greaterThan(tenEur)).toThrow(InvalidMoneyException);
      expect(() => tenUsd.lessThan(tenEur)).toThrow(InvalidMoneyException);
    });
  });

  describe('Immutability', () => {
    it('remains completely unchanged after arithmetic operations', () => {
      const original = Money.create(100.0, 'USD');
      const other = Money.create(25.0, 'USD');

      original.add(other);
      original.subtract(other);
      original.multiply(2);

      expect(original.cents).toBe(10000);
      expect(original.amount).toBe(100.0);
      expect(original.currency).toBe('USD');
    });

    it('is frozen by Object.freeze', () => {
      const money = Money.create(50.0, 'USD');
      expect(Object.isFrozen(money)).toBe(true);

      // Attempting mutation in strict mode throws or fails silently
      expect(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (money as any)._cents = 9999;
      }).toThrow();
    });
  });

  describe('Formatting & Serialization Boundary', () => {
    it('formats deterministically with toString without floating-point toFixed artifacts', () => {
      expect(Money.create(0, 'USD').toString()).toBe('0.00 USD');
      expect(Money.create(0.05, 'USD').toString()).toBe('0.05 USD');
      expect(Money.create(10.5, 'USD').toString()).toBe('10.50 USD');
      expect(Money.create(19.99, 'CAD').toString()).toBe('19.99 CAD');
      expect(Money.create(1000, 'EUR').toString()).toBe('1000.00 EUR');
    });

    it('exposes clean domain-level getValue and toJSON for mappers', () => {
      const money = Money.create(49.99, 'USD');
      const value = money.getValue();
      const json = money.toJSON();

      expect(value).toEqual({ amount: 49.99, currency: 'USD' });
      expect(json).toEqual({ amount: 49.99, currency: 'USD' });
    });
  });

  describe('Edge Cases & Commercial Sale Boundaries', () => {
    it('handles maximum relational column boundary ($9,999,999,999.99)', () => {
      const maxCol = Money.create(9999999999.99, 'USD');
      expect(maxCol.cents).toBe(999999999999);
      expect(maxCol.amount).toBe(9999999999.99);
      expect(maxCol.toString()).toBe('9999999999.99 USD');
    });

    it('handles high-volume item additions without precision loss', () => {
      // 100 items of $0.01 must equal exactly $1.00
      let total = Money.zero('USD');
      const penny = Money.create(0.01, 'USD');
      for (let i = 0; i < 100; i++) {
        total = total.add(penny);
      }
      expect(total.cents).toBe(100);
      expect(total.amount).toBe(1.0);
      expect(total.equals(Money.create(1.0, 'USD'))).toBe(true);
    });

    it('handles complex commercial cart sequence without drift', () => {
      // Item 1: 3 x $19.99 = $59.97
      const item1 = Money.create(19.99, 'USD').multiply(3);
      expect(item1.amount).toBe(59.97);

      // Item 2: 1.25 x $24.50 = $30.63
      const item2 = Money.create(24.5, 'USD').multiply(1.25);
      expect(item2.amount).toBe(30.63);

      // Subtotal = $59.97 + $30.63 = $90.60
      const subtotal = item1.add(item2);
      expect(subtotal.cents).toBe(9060);
      expect(subtotal.amount).toBe(90.6);

      // 15% discount on $90.60 = $13.59
      // 9060 cents * 0.15 = 1359 cents
      const discount = subtotal.multiply(0.15);
      expect(discount.cents).toBe(1359);
      expect(discount.amount).toBe(13.59);

      // Net total = $90.60 - $13.59 = $77.01
      const netTotal = subtotal.subtract(discount);
      expect(netTotal.cents).toBe(7701);
      expect(netTotal.amount).toBe(77.01);
    });
  });

  describe('Domain Purity & Layer Isolation', () => {
    it('verifies Money module has zero dependencies on NestJS, Prisma, HTTP, or persistence', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fs = require('fs');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const path = require('path');

      const filePath = path.resolve(__dirname, '../value-objects/money.vo.ts');
      const content = fs.readFileSync(filePath, 'utf-8');

      expect(content).not.toMatch(/@nestjs/);
      expect(content).not.toMatch(/@prisma/);
      expect(content).not.toMatch(/from\s+['"]prisma/i);
      expect(content).not.toMatch(/from\s+['"].*infrastructure/);
      expect(content).not.toMatch(/from\s+['"].*persistence/);
      expect(content).not.toMatch(/from\s+['"].*http/i);
    });
  });
});
