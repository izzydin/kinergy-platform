import type { MoneyDTO, SaleDTO } from '../types/sales.types';
import type { PaymentDetailDTO, PaymentSummaryDTO } from '../types/payments.types';

/**
 * Safely converts an amount or MoneyDTO into integer cents to prevent IEEE-754 floating-point drift.
 */
export function toCents(
  value: number | MoneyDTO | { cents?: number; amount?: number } | null | undefined,
): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 100) : 0;
  }
  if (typeof value === 'object') {
    if (typeof value.cents === 'number' && Number.isFinite(value.cents)) {
      return value.cents;
    }
    if (typeof value.amount === 'number' && Number.isFinite(value.amount)) {
      return Math.round(value.amount * 100);
    }
  }
  return 0;
}

/**
 * Formats integer cents into a standard decimal number (e.g. 1050 -> 10.50).
 */
export function centsToDecimal(cents: number): number {
  return cents / 100;
}

/**
 * Precision-safe money formatting with currency code and 2 decimal places.
 */
export function formatMoneyCents(cents: number, currency = 'USD'): string {
  return `${currency} ${(cents / 100).toFixed(2)}`;
}

export interface SalePaymentBalanceBreakdown {
  readonly totalCents: number;
  readonly completedCents: number;
  readonly pendingCents: number;
  readonly remainingCents: number;
  readonly remainingBalance: number;
  readonly isPaidInFull: boolean;
  readonly hasPendingTenders: boolean;
  readonly currency: string;
}

/**
 * Evaluates the authoritative remaining balance of a Sale by summing completed tenders.
 * All math is conducted strictly in integer cents.
 */
export function evaluateSaleBalances(
  sale: SaleDTO | null | undefined,
  payments: PaymentSummaryDTO[] | null | undefined,
): SalePaymentBalanceBreakdown {
  const currency = sale?.currency ?? 'USD';
  const totalCents = toCents(sale?.total ?? sale?.totalAmount);

  let completedCents = 0;
  let pendingCents = 0;

  if (payments && Array.isArray(payments)) {
    for (const p of payments) {
      const pCents = toCents(p.amount ?? p.amountValue);
      if (p.status === 'COMPLETED') {
        completedCents += pCents;
      } else if (p.status === 'PENDING') {
        pendingCents += pCents;
      }
    }
  }

  const remainingCents = Math.max(0, totalCents - completedCents);
  const remainingBalance = centsToDecimal(remainingCents);

  return {
    totalCents,
    completedCents,
    pendingCents,
    remainingCents,
    remainingBalance,
    isPaidInFull: totalCents > 0 && remainingCents === 0,
    hasPendingTenders: pendingCents > 0,
    currency,
  };
}

export interface SettlementConfirmationBreakdown {
  readonly saleTotalCents: number;
  readonly paymentAmountCents: number;
  readonly alreadySettledCents: number;
  readonly balanceBeforeSettlementCents: number;
  readonly balanceAfterSettlementCents: number;
  readonly currency: string;
  readonly isCurrencyMatch: boolean;
  readonly isOverpayment: boolean;
  readonly overpaymentExcessCents: number;
  readonly isPaidInFullAfterSettlement: boolean;
  readonly isPartialSettlement: boolean;
  readonly canSettle: boolean;
  readonly validationError?: string;
}

/**
 * Calculates authoritative financial confirmation summary before completing a payment settlement.
 * Validates sale status, currency parity, overpayment protection, and computes projected balances.
 */
export function evaluateSettlementConfirmation(
  payment: PaymentDetailDTO | null | undefined,
  sale: SaleDTO | null | undefined,
  salePayments: PaymentSummaryDTO[] | null | undefined,
): SettlementConfirmationBreakdown {
  const paymentCurrency = (payment?.amount?.currency ?? 'USD').toUpperCase();
  const saleCurrency = (sale?.currency ?? paymentCurrency).toUpperCase();
  const isCurrencyMatch = paymentCurrency === saleCurrency;

  const saleTotalCents = toCents(sale?.total ?? sale?.totalAmount);
  const paymentAmountCents = toCents(payment?.amount ?? payment?.amountValue);

  // Sum all other completed payments for this sale (excluding the current payment)
  let alreadySettledCents = 0;
  if (salePayments && Array.isArray(salePayments)) {
    for (const p of salePayments) {
      if (p.status === 'COMPLETED' && p.id !== payment?.id) {
        alreadySettledCents += toCents(p.amount ?? p.amountValue);
      }
    }
  }

  const balanceBeforeSettlementCents = Math.max(0, saleTotalCents - alreadySettledCents);
  const rawBalanceAfter = balanceBeforeSettlementCents - paymentAmountCents;
  const isOverpayment = rawBalanceAfter < 0;
  const overpaymentExcessCents = isOverpayment ? Math.abs(rawBalanceAfter) : 0;
  const balanceAfterSettlementCents = Math.max(0, rawBalanceAfter);

  const isPaidInFullAfterSettlement =
    !isOverpayment && saleTotalCents > 0 && balanceAfterSettlementCents === 0;
  const isPartialSettlement = !isOverpayment && balanceAfterSettlementCents > 0;

  // Precondition validations
  let validationError: string | undefined;

  if (!payment) {
    validationError = 'Payment record is unavailable.';
  } else if (payment.status !== 'PENDING') {
    validationError = `Payment is in ${payment.status} status and cannot be settled. Only PENDING payments can be completed.`;
  } else if (!sale) {
    validationError =
      'Associated commercial sale agreement could not be loaded. Completion is blocked for financial safety.';
  } else if (!isCurrencyMatch) {
    validationError = `Currency mismatch: payment is in ${paymentCurrency} while sale agreement is in ${saleCurrency}.`;
  } else if (sale.status === 'CANCELLED' || sale.status === 'DRAFT') {
    validationError = `Sale agreement is in ${sale.status} state. Payments cannot be settled against draft or cancelled sales.`;
  } else if (isOverpayment) {
    validationError = `Overpayment detected: payment amount (${paymentCurrency} ${(paymentAmountCents / 100).toFixed(2)}) exceeds remaining balance (${saleCurrency} ${(balanceBeforeSettlementCents / 100).toFixed(2)}) by ${paymentCurrency} ${(overpaymentExcessCents / 100).toFixed(2)}.`;
  }

  return {
    saleTotalCents,
    paymentAmountCents,
    alreadySettledCents,
    balanceBeforeSettlementCents,
    balanceAfterSettlementCents,
    currency: paymentCurrency,
    isCurrencyMatch,
    isOverpayment,
    overpaymentExcessCents,
    isPaidInFullAfterSettlement,
    isPartialSettlement,
    canSettle: !validationError,
    validationError,
  };
}
