import { SaleDomainException } from './sale-domain.exception';
import { EmptySaleException } from './empty-sale.exception';
import { SaleAlreadyFinalizedException } from './sale-already-finalized.exception';
import { InvalidSaleStateException } from './invalid-sale-state.exception';
import { InvalidSaleTransitionException } from './invalid-sale-transition.exception';
import { InvalidSaleItemException } from './invalid-sale-item.exception';
import { InvalidDiscountException } from './invalid-discount.exception';
import { InvalidMoneyException } from './invalid-money.exception';
import {
  SaleOptimisticLockException,
  PaymentOptimisticLockException,
} from './optimistic-lock.exception';

describe('Sales Domain Exceptions Hierarchy', () => {
  it('SaleDomainException should inherit from Error and expose default code', () => {
    const error = new SaleDomainException('Generic domain error');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SaleDomainException);
    expect(error.code).toBe('SALE_DOMAIN_ERROR');
    expect(error.name).toBe('SaleDomainException');
    expect(error.message).toBe('Generic domain error');
  });

  it('EmptySaleException should inherit from SaleDomainException and set EMPTY_SALE code', () => {
    const error = new EmptySaleException();
    expect(error).toBeInstanceOf(SaleDomainException);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('EMPTY_SALE');
    expect(error.name).toBe('EmptySaleException');
    expect(error.message).toContain('zero line items');
  });

  it('SaleAlreadyFinalizedException should inherit from SaleDomainException and set SALE_ALREADY_FINALIZED code', () => {
    const error = new SaleAlreadyFinalizedException();
    expect(error).toBeInstanceOf(SaleDomainException);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('SALE_ALREADY_FINALIZED');
    expect(error.name).toBe('SaleAlreadyFinalizedException');
  });

  it('InvalidSaleStateException should inherit from SaleDomainException and support custom codes', () => {
    const defaultStateErr = new InvalidSaleStateException('Invalid state');
    expect(defaultStateErr).toBeInstanceOf(SaleDomainException);
    expect(defaultStateErr.code).toBe('INVALID_SALE_STATE');

    const customErr = new InvalidSaleStateException(
      'Cancellation reason is required',
      'INVALID_CANCELLATION_REASON',
    );
    expect(customErr).toBeInstanceOf(SaleDomainException);
    expect(customErr.code).toBe('INVALID_CANCELLATION_REASON');
  });

  it('InvalidSaleTransitionException should inherit from InvalidSaleStateException and expose state details', () => {
    const error = new InvalidSaleTransitionException(
      'DRAFT',
      'COMPLETED',
      'Direct completion not allowed',
    );
    expect(error).toBeInstanceOf(InvalidSaleStateException);
    expect(error).toBeInstanceOf(SaleDomainException);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('INVALID_SALE_TRANSITION');
    expect(error.currentState).toBe('DRAFT');
    expect(error.targetState).toBe('COMPLETED');
    expect(error.reason).toBe('Direct completion not allowed');
    expect(error.message).toContain("from status 'DRAFT' to status 'COMPLETED'");
    expect(error.message).toContain('(Direct completion not allowed)');
  });

  it('InvalidSaleItemException should inherit from SaleDomainException and set INVALID_SALE_ITEM code', () => {
    const error = new InvalidSaleItemException('Quantity must be strictly positive');
    expect(error).toBeInstanceOf(SaleDomainException);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('INVALID_SALE_ITEM');
    expect(error.name).toBe('InvalidSaleItemException');
  });

  it('InvalidDiscountException should inherit from SaleDomainException and set INVALID_DISCOUNT code', () => {
    const error = new InvalidDiscountException('Percentage discount cannot exceed 100%');
    expect(error).toBeInstanceOf(SaleDomainException);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('INVALID_DISCOUNT');
    expect(error.name).toBe('InvalidDiscountException');
  });

  it('InvalidMoneyException should inherit from SaleDomainException and set INVALID_MONEY code', () => {
    const error = new InvalidMoneyException('Unsupported precision');
    expect(error).toBeInstanceOf(SaleDomainException);
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('INVALID_MONEY');
    expect(error.name).toBe('InvalidMoneyException');
  });

  it('PaymentOptimisticLockException should inherit from SaleOptimisticLockException and Error', () => {
    const error = new PaymentOptimisticLockException('pay_123', 2);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(SaleDomainException);
    expect(error).toBeInstanceOf(SaleOptimisticLockException);
    expect(error).toBeInstanceOf(PaymentOptimisticLockException);
    expect(error.code).toBe('OPTIMISTIC_LOCK_ERROR');
    expect(error.name).toBe('PaymentOptimisticLockException');
    expect(error.message).toContain("Payment with ID 'pay_123' was modified concurrently");
    expect(error.message).toContain('expected version: 2');
  });
});
