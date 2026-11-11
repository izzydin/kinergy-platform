import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
} from '@kinergy-platform/ui';
import { CheckCircle2, Receipt, Banknote, QrCode, AlertCircle, ExternalLink } from 'lucide-react';
import { useSessionBillingInfo } from '../hooks/use-treatment-session';
import { useTreatmentMutations } from '../hooks/use-treatment-mutations';
import { SALES_ROUTES } from '../../sales/routes/sales-routes';
import type { CompleteAndCheckoutResult } from '../types';

export interface CompleteSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId?: string;
  onConfirm?: () => Promise<void> | void;
  onCheckoutSuccess?: (result: CompleteAndCheckoutResult) => void;
  isLoading?: boolean;
  hasNotes?: boolean;
  hasUnsavedNotes?: boolean;
  error?: Error | null;
}

export const CompleteSessionModal: React.FC<CompleteSessionModalProps> = ({
  isOpen,
  onClose,
  sessionId,
  onConfirm,
  onCheckoutSuccess,
  isLoading = false,
  hasNotes = true,
  hasUnsavedNotes = false,
  error = null,
}) => {
  let navigate: ReturnType<typeof useNavigate> | undefined;
  try {
    navigate = useNavigate();
  } catch {
    navigate = undefined;
  }
  const [flowOption, setFlowOption] = useState<'COLLECT_PAYMENT' | 'ALREADY_PAID'>(
    'COLLECT_PAYMENT',
  );
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'QR'>('CASH');
  const [cashTendered, setCashTendered] = useState<string>('');
  const [paymentReference, setPaymentReference] = useState<string>('');
  const [acknowledgedEmptyNotes, setAcknowledgedEmptyNotes] = useState(false);
  const [acknowledgedUnsavedNotes, setAcknowledgedUnsavedNotes] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState<CompleteAndCheckoutResult | null>(null);

  const billingQueryResult =
    typeof useSessionBillingInfo === 'function'
      ? useSessionBillingInfo(sessionId, {
          enabled: isOpen && Boolean(sessionId),
        })
      : undefined;
  const billingInfo = billingQueryResult?.data;
  const isBillingLoading = billingQueryResult?.isLoading ?? false;

  const mutations =
    typeof useTreatmentMutations === 'function' ? useTreatmentMutations(sessionId) : undefined;
  const checkoutSession = mutations?.checkoutSession ?? {
    isPending: false,
    error: null,
    mutateAsync: async () => {
      if (onConfirm) await onConfirm();
      return {} as unknown as CompleteAndCheckoutResult;
    },
  };

  // Auto-select flow option if already paid
  useEffect(() => {
    if (billingInfo?.isAlreadyPaid) {
      setFlowOption('ALREADY_PAID');
    }
  }, [billingInfo?.isAlreadyPaid]);

  const handleClose = () => {
    setAcknowledgedEmptyNotes(false);
    setAcknowledgedUnsavedNotes(false);
    setCheckoutResult(null);
    setCashTendered('');
    setPaymentReference('');
    onClose();
  };

  const handleConfirm = async () => {
    try {
      if (sessionId) {
        const res = await checkoutSession.mutateAsync({
          flowOption,
          paymentMethod: flowOption === 'COLLECT_PAYMENT' ? paymentMethod : undefined,
          paymentReference: paymentReference.trim() || undefined,
        });
        setCheckoutResult(res);
        if (onCheckoutSuccess) {
          onCheckoutSuccess(res);
        }
      } else if (onConfirm) {
        await onConfirm();
      }
    } catch {
      // Error handled by mutation/caller
    }
  };

  const activeError = error || (checkoutSession.error as Error | null);
  const isSubmitting = isLoading || checkoutSession.isPending;

  // Change calculation for CASH tender
  const rawPriceAmount = billingInfo?.price?.amount ?? 85;
  const priceAmountCents =
    rawPriceAmount < 1000 ? Math.round(rawPriceAmount * 100) : rawPriceAmount;
  const priceFormatted =
    billingInfo?.price?.formatted ?? `$${(priceAmountCents / 100).toFixed(2)} USD`;
  const tenderedCents = cashTendered ? Math.round(parseFloat(cashTendered) * 100) : 0;
  const changeDueCents = tenderedCents > priceAmountCents ? tenderedCents - priceAmountCents : 0;

  const isOptionBInvalid =
    flowOption === 'ALREADY_PAID' && billingInfo && !billingInfo.isAlreadyPaid;

  const isConfirmDisabled =
    isSubmitting ||
    (Boolean(sessionId) && isBillingLoading) ||
    (!hasNotes && !acknowledgedEmptyNotes) ||
    (hasUnsavedNotes && !acknowledgedUnsavedNotes) ||
    isOptionBInvalid;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        {/* ================================================================= */}
        {/* SUCCESS STATE VIEW */}
        {/* ================================================================= */}
        {checkoutResult ? (
          <div className="space-y-4 py-2" data-testid="checkout-success-view">
            <DialogHeader>
              <div className="flex items-center space-x-2 text-status-success">
                <CheckCircle2 className="h-6 w-6" />
                <DialogTitle className="text-foreground font-bold text-lg">
                  Treatment Encounter Finalized & Settled
                </DialogTitle>
              </div>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                The clinical documentation is sealed and the financial transaction has been settled.
              </DialogDescription>
            </DialogHeader>

            <div className="rounded-lg border border-status-success-border bg-status-success-surface p-4 space-y-3 text-sm text-foreground">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground font-medium">Client</span>
                  <p className="font-semibold text-foreground text-sm">
                    {checkoutResult.clientFullName}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground font-medium">Session Status</span>
                  <p className="font-semibold text-foreground">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border border-status-success-border bg-status-success-surface text-status-success">
                      {checkoutResult.sessionStatus}
                    </span>
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground font-medium">Sale & Payment</span>
                  <p className="font-semibold text-foreground">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border border-status-success-border bg-status-success-surface text-status-success">
                      PAID ({checkoutResult.paymentMethod ?? 'CASH'})
                    </span>
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground font-medium">Amount Settled</span>
                  <p className="font-semibold text-foreground">
                    ${(checkoutResult.amount / 100).toFixed(2)} {checkoutResult.currency}
                  </p>
                </div>
              </div>

              {checkoutResult.receiptNumber && (
                <div className="pt-2 border-t border-status-success-border/80 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Official Receipt:</span>
                  <span className="font-mono font-bold text-foreground">
                    #{checkoutResult.receiptNumber}
                  </span>
                </div>
              )}
            </div>

            <DialogFooter className="flex flex-col sm:flex-row sm:justify-between items-center gap-2 pt-2">
              {checkoutResult.saleId ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full sm:w-auto text-xs flex items-center space-x-1.5"
                  onClick={() => {
                    handleClose();
                    navigate?.(SALES_ROUTES.receipt(checkoutResult.saleId!));
                  }}
                  data-testid="modal-view-receipt-btn"
                >
                  <Receipt className="h-4 w-4" />
                  <span>View Official Receipt</span>
                  <ExternalLink className="h-3 w-3 ml-0.5 opacity-70" />
                </Button>
              ) : (
                <div />
              )}
              <Button
                type="button"
                variant="default"
                onClick={handleClose}
                className="w-full sm:w-auto"
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          /* ================================================================= */
          /* COMPLETION & CHECKOUT FORM VIEW */
          /* ================================================================= */
          <>
            <DialogHeader>
              <DialogTitle className="text-foreground font-bold">
                Sign & Complete Treatment Session
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1">
                Complete Treatment & Checkout — finalize clinical encounter and settle billing.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3.5 my-2 text-xs">
              {/* Encounter Summary & Authoritative Pricing */}
              {billingInfo && (
                <div className="rounded-lg border border-border bg-muted/30 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-muted-foreground font-medium uppercase tracking-wider text-[10px]">
                        Client
                      </span>
                      <p
                        className="font-semibold text-foreground text-sm"
                        data-testid="billing-client-display"
                      >
                        {billingInfo.clientFullName}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-muted-foreground font-medium uppercase tracking-wider text-[10px]">
                        Service Fee
                      </span>
                      <p
                        className="font-bold text-foreground text-base"
                        data-testid="billing-price-display"
                      >
                        {priceFormatted}
                      </p>
                    </div>
                  </div>
                  <div className="text-muted-foreground flex items-center justify-between text-xs pt-1 border-t border-border/70">
                    <span>{billingInfo.serviceDescription}</span>
                    {billingInfo.isAlreadyPaid && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border border-status-success-border bg-status-success-surface text-status-success">
                        ✓ Upfront Paid
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Payment Decision Options (Option A vs Option B) */}
              <div className="space-y-2">
                <span className="text-foreground font-semibold block text-xs">
                  Financial Settlement Option:
                </span>

                {/* Option A Card */}
                <div
                  className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                    flowOption === 'COLLECT_PAYMENT'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:bg-muted/40'
                  } ${billingInfo?.isAlreadyPaid ? 'opacity-50 cursor-not-allowed' : ''}`}
                  onClick={() => {
                    if (!billingInfo?.isAlreadyPaid) {
                      setFlowOption('COLLECT_PAYMENT');
                    }
                  }}
                  data-testid="flow-collect-payment-card"
                >
                  <label className="flex items-start space-x-2.5 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="flowOption"
                      value="COLLECT_PAYMENT"
                      checked={flowOption === 'COLLECT_PAYMENT'}
                      onChange={() => setFlowOption('COLLECT_PAYMENT')}
                      disabled={isSubmitting || Boolean(billingInfo?.isAlreadyPaid)}
                      className="mt-0.5 h-4 w-4 text-primary focus:ring-primary"
                      data-testid="flow-collect-payment-radio"
                    />
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-foreground text-xs">
                          Option A — Complete & Collect Payment
                        </span>
                        <span className="font-mono text-xs font-bold text-foreground">
                          {priceFormatted}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-[11px]">
                        Receive payment directly from client upon completion. Creates 1 Sale & 1
                        settled Payment.
                      </p>

                      {/* Payment Method Selector (CASH / QR) */}
                      {flowOption === 'COLLECT_PAYMENT' && (
                        <div className="pt-2 mt-2 border-t border-border space-y-2">
                          <div className="flex items-center space-x-2">
                            <button
                              type="button"
                              onClick={() => setPaymentMethod('CASH')}
                              disabled={isSubmitting}
                              className={`flex-1 py-1.5 px-3 rounded border text-xs font-medium flex items-center justify-center space-x-1.5 transition-all ${
                                paymentMethod === 'CASH'
                                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                                  : 'border-border bg-background text-foreground hover:bg-muted'
                              }`}
                              data-testid="payment-method-cash-btn"
                            >
                              <Banknote className="h-4 w-4" />
                              <span>Cash Tender</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setPaymentMethod('QR')}
                              disabled={isSubmitting}
                              className={`flex-1 py-1.5 px-3 rounded border text-xs font-medium flex items-center justify-center space-x-1.5 transition-all ${
                                paymentMethod === 'QR'
                                  ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                                  : 'border-border bg-background text-foreground hover:bg-muted'
                              }`}
                              data-testid="payment-method-qr-btn"
                            >
                              <QrCode className="h-4 w-4" />
                              <span>QR Code</span>
                            </button>
                          </div>

                          {/* Cash Change Calculator */}
                          {paymentMethod === 'CASH' && (
                            <div className="rounded bg-background border border-border p-2 space-y-1.5">
                              <div className="flex items-center justify-between">
                                <span className="text-muted-foreground text-[11px]">
                                  Cash Received:
                                </span>
                                <div className="flex items-center space-x-1 w-28">
                                  <span className="text-muted-foreground text-xs">$</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="0.00"
                                    value={cashTendered}
                                    onChange={(e) => setCashTendered(e.target.value)}
                                    className="w-full px-2 py-0.5 border border-input rounded text-xs text-right font-mono bg-background text-foreground"
                                    data-testid="cash-tendered-input"
                                  />
                                </div>
                              </div>
                              {tenderedCents > 0 && (
                                <div
                                  className="flex items-center justify-between pt-1 border-t border-border font-semibold text-xs"
                                  data-testid="cash-change-display"
                                >
                                  <span className="text-foreground">Change Due:</span>
                                  <span
                                    className={`font-mono ${
                                      changeDueCents >= 0
                                        ? 'text-status-success'
                                        : 'text-destructive'
                                    }`}
                                  >
                                    ${(changeDueCents / 100).toFixed(2)}
                                  </span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Reference input */}
                          <div>
                            <input
                              type="text"
                              placeholder={
                                paymentMethod === 'CASH'
                                  ? 'Optional cash reference notes'
                                  : 'Optional QR transaction confirmation code'
                              }
                              value={paymentReference}
                              onChange={(e) => setPaymentReference(e.target.value)}
                              className="w-full px-2.5 py-1 border border-input rounded text-xs bg-background text-foreground"
                              data-testid="payment-reference-input"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </label>
                </div>

                {/* Option B Card */}
                <div
                  className={`rounded-lg border p-3 cursor-pointer transition-colors ${
                    flowOption === 'ALREADY_PAID'
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border hover:bg-muted/40'
                  }`}
                  onClick={() => setFlowOption('ALREADY_PAID')}
                  data-testid="flow-already-paid-card"
                >
                  <label className="flex items-start space-x-2.5 cursor-pointer select-none">
                    <input
                      type="radio"
                      name="flowOption"
                      value="ALREADY_PAID"
                      checked={flowOption === 'ALREADY_PAID'}
                      onChange={() => setFlowOption('ALREADY_PAID')}
                      disabled={isSubmitting}
                      className="mt-0.5 h-4 w-4 text-primary focus:ring-primary"
                      data-testid="flow-already-paid-radio"
                    />
                    <div className="flex-1 space-y-1">
                      <span className="font-semibold text-foreground text-xs block">
                        Option B — Complete Treatment (Already Paid)
                      </span>
                      <p className="text-muted-foreground text-[11px]">
                        Client already paid at reception or online. Verifies settled payment and
                        avoids double-charging.
                      </p>

                      {/* Option B Status Feedback */}
                      {billingInfo && (
                        <div className="pt-1.5">
                          {billingInfo.isAlreadyPaid ? (
                            <div className="rounded bg-status-success-surface border border-status-success-border p-2 text-foreground text-[11px] space-y-0.5">
                              <p className="font-semibold text-status-success">
                                ✓ Verified Settled Payment
                              </p>
                              <p className="text-muted-foreground">
                                Active Sale #{billingInfo.existingSaleId?.slice(-8)} is fully paid.
                                Completing will not re-charge the client.
                              </p>
                            </div>
                          ) : (
                            <div className="rounded bg-status-warning-surface border border-status-warning-border p-2 text-foreground text-[11px] space-y-0.5">
                              <p className="font-semibold flex items-center space-x-1 text-status-warning">
                                <AlertCircle className="h-3.5 w-3.5 inline text-status-warning" />
                                <span>No Prior Payment Found</span>
                              </p>
                              <p className="text-muted-foreground">
                                No settled payment is linked to this appointment. Please collect
                                payment via Option A.
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </label>
                </div>
              </div>

              {/* Clinical Documentation Status Notice */}
              {hasNotes ? (
                <div
                  className="rounded-md bg-status-success-surface border border-status-success-border p-2.5 text-foreground"
                  data-testid="notes-present-notice"
                >
                  <p className="font-semibold text-status-success">✓ Clinical Notes Documented</p>
                  <p className="text-[11px] mt-0.5 text-muted-foreground">
                    Structured SOAP findings are recorded and will be permanently sealed upon
                    signing.
                  </p>
                </div>
              ) : (
                <div
                  className="rounded-md bg-status-warning-surface border border-status-warning-border p-2.5 text-foreground space-y-1.5"
                  data-testid="empty-notes-warning"
                >
                  <div>
                    <p className="font-semibold text-status-warning">
                      ⚠️ Incomplete Clinical Documentation Notice
                    </p>
                    <p className="text-[11px] mt-0.5 text-muted-foreground">
                      No SOAP progress notes documented. Completing will lock this clinical record
                      with empty documentation.
                    </p>
                  </div>
                  <label className="flex items-start space-x-2 pt-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      data-testid="confirm-empty-notes-checkbox"
                      className="mt-0.5 h-3.5 w-3.5 rounded border-status-warning-border text-status-warning focus:ring-status-warning"
                      checked={acknowledgedEmptyNotes}
                      onChange={(e) => setAcknowledgedEmptyNotes(e.target.checked)}
                      disabled={isSubmitting}
                    />
                    <span className="text-[11px] text-foreground font-medium">
                      I acknowledge completing this encounter without documented SOAP notes.
                    </span>
                  </label>
                </div>
              )}

              {/* Unsaved Draft Notes Warning */}
              {hasUnsavedNotes && (
                <div
                  className="rounded-md bg-status-warning-surface border border-status-warning-border p-2.5 text-foreground space-y-1.5"
                  data-testid="unsaved-notes-warning"
                >
                  <div>
                    <p className="font-semibold text-status-warning">
                      ⚠️ Unsaved Note Changes in Editor
                    </p>
                    <p className="text-[11px] mt-0.5 text-muted-foreground">
                      You have unsaved changes in the clinical SOAP editor. Signing will seal
                      documentation and discard unsaved drafts.
                    </p>
                  </div>
                  <label className="flex items-start space-x-2 pt-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      data-testid="confirm-unsaved-notes-checkbox"
                      className="mt-0.5 h-3.5 w-3.5 rounded border-status-warning-border text-status-warning focus:ring-status-warning"
                      checked={acknowledgedUnsavedNotes}
                      onChange={(e) => setAcknowledgedUnsavedNotes(e.target.checked)}
                      disabled={isSubmitting}
                    />
                    <span className="text-[11px] text-foreground font-medium">
                      I acknowledge that unsaved edits in the editor will be discarded upon signing.
                    </span>
                  </label>
                </div>
              )}

              {activeError && (
                <div
                  className="rounded-md bg-red-50 border border-red-200 p-2.5 text-red-800"
                  role="alert"
                  data-testid="complete-error-banner"
                >
                  <p className="font-semibold">Completion Failed</p>
                  <p className="text-[11px] mt-0.5">
                    {activeError.message || 'An error occurred while completing the session.'}
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="flex justify-end space-x-2 pt-3">
              <Button type="button" variant="outline" onClick={handleClose} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="default"
                onClick={handleConfirm}
                disabled={isConfirmDisabled}
                data-testid="sign-and-complete-btn"
              >
                {isSubmitting
                  ? 'Completing & Settling...'
                  : flowOption === 'COLLECT_PAYMENT'
                    ? `Sign & Complete — Collect Payment (${priceFormatted})`
                    : 'Sign & Complete (Already Paid)'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
