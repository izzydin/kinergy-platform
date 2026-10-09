import {
  InvalidMoneyException,
  InvalidSaleItemException,
  InvalidDiscountException,
  PaymentDomainException,
  InvalidPaymentAmountException,
  ReceiptDomainException,
  SaleDomainException,
} from '../../../../domain/exceptions';
import {
  PaymentOptimisticLockException,
  SaleOptimisticLockException,
} from '../../../../domain/exceptions/optimistic-lock.exception';
import { PaymentNotFoundException } from '../../../../application/exceptions/payment-not-found.exception';
import { SaleNotFoundException } from '../../../../application/exceptions/sale-not-found.exception';
import { DuplicatePaymentReferenceException } from '../../../../application/exceptions/duplicate-payment-reference.exception';
import { PaymentSaleConsistencyException } from '../../../../application/exceptions/payment-sale-consistency.exception';
import { PaymentPersistenceException } from '../exceptions/payment-persistence.exception';

/**
 * Utility responsible for inspecting Prisma Client and PostgreSQL database errors
 * and mapping structural CHECK constraint and relational FK/unique failures into canonical domain/application exceptions.
 */
export class PrismaDatabaseErrorMapper {
  /**
   * Inspects a database error and maps known relational constraints (FK P2003, Unique P2002, NotFound P2025)
   * or CHECK constraints into meaningful domain and application exceptions.
   * Unmapped errors are wrapped in PaymentPersistenceException without exposing raw Prisma errors.
   */
  public static mapDatabaseError(
    error: unknown,
    context?: { saleId?: string; reference?: string | null; paymentId?: string },
  ): Error {
    if (!error || typeof error !== 'object') {
      return new PaymentPersistenceException(String(error));
    }

    // 1. Preserve existing domain or application exceptions directly without re-wrapping
    if (
      error instanceof PaymentDomainException ||
      error instanceof SaleDomainException ||
      error instanceof ReceiptDomainException ||
      error instanceof PaymentOptimisticLockException ||
      error instanceof SaleOptimisticLockException ||
      error instanceof PaymentNotFoundException ||
      error instanceof SaleNotFoundException ||
      error instanceof DuplicatePaymentReferenceException ||
      error instanceof PaymentSaleConsistencyException
    ) {
      return error;
    }

    // 2. Map CHECK constraints
    const checkError = this.mapCheckConstraintError(error);
    if (checkError) {
      return checkError;
    }

    const err = error as {
      code?: string;
      message?: string;
      meta?: {
        target?: unknown;
        field_name?: string;
        modelName?: string;
        cause?: string;
      };
    };

    const code = err.code ?? '';
    const message = err.message ?? '';
    const targetStr = Array.isArray(err.meta?.target)
      ? err.meta.target.join(',')
      : typeof err.meta?.target === 'string'
        ? err.meta.target
        : '';
    const fieldName = err.meta?.field_name ?? '';

    // 3. Map P2002 (Unique Constraint Violation) -> DuplicatePaymentReferenceException
    if (code === 'P2002' || (!code && message.includes('Unique constraint failed'))) {
      return new DuplicatePaymentReferenceException(
        context?.reference ?? 'duplicate-reference',
        context?.saleId ?? 'unknown-sale',
      );
    }

    // 4. Map P2003 (Foreign Key Constraint Violation) -> SaleNotFoundException
    if (
      code === 'P2003' ||
      (!code &&
        (message.includes('foreign key constraint') ||
          fieldName.includes('sale') ||
          targetStr.includes('saleId') ||
          targetStr.includes('sale_id')))
    ) {
      const saleId = context?.saleId ?? 'referenced-sale';
      return new SaleNotFoundException(saleId);
    }

    // 5. Map P2025 (Record not found on update) -> PaymentNotFoundException
    if (code === 'P2025' || message.includes('Record to update not found')) {
      return new PaymentNotFoundException(context?.paymentId ?? 'unknown-payment');
    }

    // 6. Generic database error: never expose raw Prisma errors to callers
    return new PaymentPersistenceException(
      `Database persistence error occurred: ${message || 'internal persistence failure'}`,
      { cause: error },
    );
  }
  /**
   * Inspects an unknown error and maps known PostgreSQL CHECK constraint violations
   * into domain-meaningful exceptions. Returns null if not a recognized check constraint.
   */
  public static mapCheckConstraintError(error: unknown): Error | null {
    if (!error || typeof error !== 'object') {
      return null;
    }

    const err = error as {
      code?: string;
      message?: string;
      constraint?: string;
      meta?: {
        database_error?: string;
        target?: unknown;
        modelName?: string;
      };
    };

    // Extract error message and constraint name candidate
    const message = err.message || '';
    const constraintName =
      err.constraint ||
      (typeof err.meta?.database_error === 'string' ? err.meta.database_error : '') ||
      '';

    // Verify if it is a check constraint violation (SQLSTATE 23514, Prisma P2004, or message)
    const isCheckViolation =
      err.code === '23514' ||
      err.code === 'P2004' ||
      message.includes('violates check constraint') ||
      message.includes('check constraint');

    if (!isCheckViolation && !constraintName) {
      return null;
    }

    // Helper to test if a constraint matches
    const matches = (name: string): boolean => {
      return (
        constraintName === name ||
        message.includes(`"${name}"`) ||
        message.includes(`'${name}'`) ||
        message.includes(name)
      );
    };

    // 1. Sales table constraints
    if (matches('chk_sales_non_negative_subtotal')) {
      return new InvalidMoneyException('Sale subtotal amount cannot be negative.');
    }
    if (matches('chk_sales_non_negative_discount_total')) {
      return new InvalidMoneyException('Sale discount total amount cannot be negative.');
    }
    if (matches('chk_sales_non_negative_total')) {
      return new InvalidMoneyException('Sale total amount cannot be negative.');
    }
    if (matches('chk_sales_non_negative_order_discount_val')) {
      return new InvalidDiscountException('Order discount value cannot be negative.');
    }
    if (matches('chk_sales_discount_type_supported')) {
      return new InvalidDiscountException('Unsupported order discount type.');
    }
    if (matches('chk_sales_discount_percentage_max')) {
      return new InvalidDiscountException('Order discount percentage cannot exceed 100%.');
    }
    if (matches('chk_sales_discount_co_presence')) {
      return new InvalidDiscountException(
        'Order discount type and value must be provided together.',
      );
    }

    // 2. Sale Items table constraints
    if (matches('chk_sale_items_non_negative_unit_price')) {
      return new InvalidMoneyException('Sale item unit price amount cannot be negative.');
    }
    if (matches('chk_sale_items_non_negative_subtotal')) {
      return new InvalidMoneyException('Sale item subtotal amount cannot be negative.');
    }
    if (matches('chk_sale_items_non_negative_discount_total')) {
      return new InvalidMoneyException('Sale item discount total amount cannot be negative.');
    }
    if (matches('chk_sale_items_non_negative_total')) {
      return new InvalidMoneyException('Sale item total amount cannot be negative.');
    }
    if (matches('chk_sale_items_positive_quantity')) {
      return new InvalidSaleItemException('Sale item quantity must be strictly greater than zero.');
    }
    if (matches('chk_sale_items_non_negative_discount_val')) {
      return new InvalidDiscountException('Sale item discount value cannot be negative.');
    }
    if (matches('chk_sale_items_discount_type_supported')) {
      return new InvalidDiscountException('Unsupported sale item discount type.');
    }
    if (matches('chk_sale_items_discount_percentage_max')) {
      return new InvalidDiscountException('Sale item discount percentage cannot exceed 100%.');
    }
    if (matches('chk_sale_items_discount_co_presence')) {
      return new InvalidDiscountException(
        'Sale item discount type and value must be provided together.',
      );
    }

    // 3. Payments table constraints
    if (matches('chk_payments_positive_amount')) {
      return new InvalidPaymentAmountException(
        'Payment amount must be strictly greater than zero.',
        'PAYMENT_AMOUNT_MUST_BE_POSITIVE',
      );
    }

    // 4. Receipts table constraints
    if (matches('chk_receipts_non_negative_subtotal')) {
      return new ReceiptDomainException(
        'Receipt subtotal amount cannot be negative.',
        'RECEIPT_NEGATIVE_SUBTOTAL',
      );
    }
    if (matches('chk_receipts_non_negative_discount_total')) {
      return new ReceiptDomainException(
        'Receipt discount total amount cannot be negative.',
        'RECEIPT_NEGATIVE_DISCOUNT_TOTAL',
      );
    }
    if (matches('chk_receipts_non_negative_total')) {
      return new ReceiptDomainException(
        'Receipt total amount cannot be negative.',
        'RECEIPT_NEGATIVE_TOTAL',
      );
    }

    // Fallback for unclassified check constraint violations
    if (isCheckViolation) {
      return new SaleDomainException(
        `Database check constraint violation: financial or structural invariant failed (${message || 'check constraint'}).`,
        'DATABASE_CHECK_CONSTRAINT_VIOLATION',
      );
    }

    return null;
  }
}
