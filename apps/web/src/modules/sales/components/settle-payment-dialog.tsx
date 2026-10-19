import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
  Badge,
} from '@kinergy-platform/ui';
import {
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ShoppingBag,
  CreditCard,
  Scale,
  ShieldAlert,
} from 'lucide-react';
import type {
  PaymentDetailDTO,
  PaymentSummaryDTO,
  SettlePaymentInputDTO,
} from '../types/payments.types';
import type { SaleDTO } from '../types/sales.types';
import { PaymentMethodBadge } from './payment-method-badge';
import { MoneyDisplay } from './money-display';
import {
  evaluateSettlementConfirmation,
  formatMoneyCents,
  centsToDecimal,
} from '../utils/financial-math';

export interface SettlePaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: PaymentDetailDTO;
  sale?: SaleDTO | null;
  salePayments?: PaymentSummaryDTO[] | null;
  isSaleLoading?: boolean;
  isSubmitting?: boolean;
  onConfirm: (input?: SettlePaymentInputDTO) => Promise<void> | void;
}

export const SettlePaymentDialog: React.FC<SettlePaymentDialogProps> = ({
  open,
  onOpenChange,
  payment,
  sale,
  salePayments,
  isSaleLoading = false,
  isSubmitting = false,
  onConfirm,
}) => {
  const [reference, setReference] = useState('');
  const [submissionError, setSubmissionError] = useState<{
    message: string;
    isAmbiguous?: boolean;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setReference(payment?.reference || '');
      setSubmissionError(null);
    }
  }, [open, payment]);

  const summary = evaluateSettlementConfirmation(payment, sale, salePayments);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !summary.canSettle) return;
    setSubmissionError(null);

    try {
      await onConfirm({
        reference: reference.trim() || undefined,
      });
      onOpenChange(false);
    } catch (err: unknown) {
      const errorObj = err as Record<string, unknown>;
      const status =
        (errorObj?.status as number | undefined) ??
        (errorObj?.statusCode as number | undefined) ??
        ((errorObj?.response as Record<string, unknown>)?.status as number | undefined);
      const rawMessage =
        ((errorObj?.response as Record<string, unknown>)?.data as Record<string, unknown>)
          ?.message ??
        (errorObj?.message as string) ??
        'Failed to settle payment tender.';
      const message = Array.isArray(rawMessage) ? rawMessage.join(', ') : String(rawMessage);

      const isAmbiguous =
        !status ||
        status === 0 ||
        message.toLowerCase().includes('network') ||
        message.toLowerCase().includes('timeout') ||
        message.toLowerCase().includes('fetch');

      setSubmissionError({ message, isAmbiguous });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isSubmitting) return;
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent
        className="max-w-xl"
        data-testid="settle-payment-dialog"
        hideCloseButton={isSubmitting}
        onEscapeKeyDown={(e) => {
          if (isSubmitting) e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (isSubmitting) e.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Complete & Settle Payment Tender
          </DialogTitle>
          <DialogDescription className="text-xs">
            Review authoritative financial reconciliation values before committing settlement to the
            internal aggregate ledger.
          </DialogDescription>
        </DialogHeader>

        {/* Identification strip */}
        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/40 border text-xs">
          <div className="flex items-center gap-1.5 font-mono">
            <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Tender:</span>
            <span className="font-semibold text-foreground" data-testid="settle-dialog-payment-id">
              {payment?.id}
            </span>
          </div>
          <div className="flex items-center gap-1.5 font-mono">
            <ShoppingBag className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-muted-foreground">Agreement:</span>
            <span className="font-semibold text-foreground" data-testid="settle-dialog-sale-id">
              {payment?.saleId}
            </span>
          </div>
        </div>

        {/* Validation / Inconsistency Blocker Alert */}
        {summary.validationError && (
          <div
            className="flex items-start gap-2.5 p-3 rounded-lg border border-destructive/40 bg-destructive/10 text-destructive text-xs"
            role="alert"
            data-testid="settlement-validation-error"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold">Settlement Blocked for Financial Safety</p>
              <p>{summary.validationError}</p>
            </div>
          </div>
        )}

        {/* Submission Error Alert (Preserves Context on API Failure) */}
        {submissionError && (
          <div
            className={`p-3 rounded-lg text-xs border space-y-1 ${
              submissionError.isAmbiguous
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                : 'border-destructive/30 bg-destructive/10 text-destructive'
            }`}
            data-testid="settle-submission-error"
            role="alert"
          >
            <div className="flex items-center gap-1.5 font-semibold">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              {submissionError.isAmbiguous
                ? 'Ambiguous Network Outcome'
                : 'Settlement Request Rejected'}
            </div>
            <p>{submissionError.message}</p>
            {submissionError.isAmbiguous && (
              <p className="text-[11px] opacity-90">
                A network interruption occurred while settling this tender. Because the server may
                have already committed this transaction, please inspect the Payments Log before
                attempting to re-submit.
              </p>
            )}
          </div>
        )}

        {/* Financial Confirmation Summary Box */}
        <div
          className="border rounded-lg p-4 space-y-3 bg-muted/20"
          data-testid="financial-confirmation-summary"
        >
          <div className="flex items-center justify-between pb-2 border-b border-border text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Scale className="h-3.5 w-3.5 text-primary" />
              Authoritative Financial Summary
            </span>
            <span>{summary.currency}</span>
          </div>

          {isSaleLoading ? (
            <div className="py-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" /> Loading authoritative sale balances...
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 text-xs">
              {/* 1. Sale Total */}
              <div className="p-2.5 rounded border bg-card">
                <span className="text-muted-foreground block text-[11px]">1. Sale Total</span>
                <div
                  className="mt-1 text-base font-bold font-mono text-foreground"
                  data-testid="summary-sale-total"
                >
                  <MoneyDisplay
                    value={centsToDecimal(summary.saleTotalCents)}
                    currency={summary.currency}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">Order total payable</span>
              </div>

              {/* 2. Payment Amount */}
              <div className="p-2.5 rounded border bg-card">
                <span className="text-muted-foreground block text-[11px]">2. Payment Amount</span>
                <div
                  className="mt-1 text-base font-bold font-mono text-primary"
                  data-testid="summary-payment-amount"
                >
                  <MoneyDisplay
                    value={centsToDecimal(summary.paymentAmountCents)}
                    currency={summary.currency}
                  />
                </div>
                <span className="text-[10px] text-muted-foreground">Tender being completed</span>
              </div>

              {/* 3. Payment Method */}
              <div className="p-2.5 rounded border bg-card">
                <span className="text-muted-foreground block text-[11px]">3. Payment Method</span>
                <div className="mt-1.5" data-testid="summary-payment-method">
                  <PaymentMethodBadge method={payment?.method} />
                </div>
                <span className="text-[10px] text-muted-foreground block mt-1">
                  Settlement rail: {payment?.method}
                </span>
              </div>

              {/* 4. Remaining Balance (Projected) */}
              <div
                className={`p-2.5 rounded border bg-card ${
                  summary.isOverpayment
                    ? 'border-destructive/50 bg-destructive/5'
                    : summary.isPaidInFullAfterSettlement
                      ? 'border-emerald-500/40 bg-emerald-500/5'
                      : 'border-primary/30'
                }`}
              >
                <span className="text-muted-foreground block text-[11px]">
                  4. Remaining Balance (Post-Settlement)
                </span>
                <div
                  className={`mt-1 text-base font-bold font-mono ${
                    summary.isOverpayment
                      ? 'text-destructive'
                      : summary.isPaidInFullAfterSettlement
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-foreground'
                  }`}
                  data-testid="summary-remaining-balance"
                >
                  <MoneyDisplay
                    value={centsToDecimal(summary.balanceAfterSettlementCents)}
                    currency={summary.currency}
                  />
                </div>
                <div className="mt-1" data-testid="summary-balance-status">
                  {summary.isOverpayment ? (
                    <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                      INVALID: Overpayment (+
                      {formatMoneyCents(summary.overpaymentExcessCents, summary.currency)})
                    </Badge>
                  ) : summary.isPaidInFullAfterSettlement ? (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800"
                    >
                      PAID IN FULL (Zero Balance)
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 text-amber-700 bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-800"
                    >
                      PARTIAL (
                      {formatMoneyCents(summary.balanceAfterSettlementCents, summary.currency)}{' '}
                      Remaining)
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Audit consequence notice */}
          <div className="p-2.5 rounded bg-muted/60 text-[11px] text-muted-foreground border">
            <p>
              <strong>Settlement Consequence:</strong> Marking this tender as completed commits
              funds to the sales order aggregate, records an immutable settlement timestamp, and
              updates the order payment status. This operation cannot be reversed.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="settle-reference-input" className="text-xs font-medium">
              Drawer Reference / Gateway Settlement Tag (Optional)
            </label>
            <Input
              id="settle-reference-input"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              disabled={isSubmitting || !summary.canSettle}
              placeholder="e.g. DRAWER-01, SETTLE-REF-492"
              className="text-xs font-mono"
              data-testid="settle-reference-input"
            />
            <p className="text-[11px] text-muted-foreground">
              Optional audit reference to correlate physical cash drawer or electronic rail
              settlement.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
              data-testid="cancel-settle-dialog-btn"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={isSubmitting || !summary.canSettle}
              className="gap-1.5"
              data-testid="confirm-settle-payment-btn"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" /> Completing Payment...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Complete & Settle Payment
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
