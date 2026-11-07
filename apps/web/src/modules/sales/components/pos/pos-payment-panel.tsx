import React, { useState, useEffect } from 'react';
import { Card, CardContent, Button, Input, Spinner } from '@kinergy-platform/ui';
import { Banknote, QrCode, CheckCircle2, AlertCircle, FileText, DollarSign } from 'lucide-react';
import type { PosPaymentMethod } from './pos-types';
import { formatMoneyCents, centsToDecimal, toCents } from '../../utils/financial-math';

export interface PosPaymentPanelProps {
  netTotalCents: number;
  currency: string;
  isCartEmpty: boolean;
  isSubmitting: boolean;
  statusMessage?: string;
  errorMessage?: string | null;
  onCheckout: (
    paymentMethod: PosPaymentMethod,
    tenderAmount?: number,
    reference?: string,
  ) => Promise<void>;
  onSaveDraft: () => Promise<void>;
}

export const PosPaymentPanel: React.FC<PosPaymentPanelProps> = ({
  netTotalCents,
  currency,
  isCartEmpty,
  isSubmitting,
  statusMessage,
  errorMessage,
  onCheckout,
  onSaveDraft,
}) => {
  const [selectedMethod, setSelectedMethod] = useState<PosPaymentMethod>('CASH');
  const [tenderAmount, setTenderAmount] = useState<number>(centsToDecimal(netTotalCents));
  const [qrReference, setQrReference] = useState<string>('');

  // Keep default tender amount synchronized with net total when total changes
  useEffect(() => {
    setTenderAmount(centsToDecimal(netTotalCents));
  }, [netTotalCents]);

  const tenderCents = toCents(tenderAmount);
  const changeCents = Math.max(0, tenderCents - netTotalCents);
  const isUnderpaid = selectedMethod === 'CASH' && tenderCents < netTotalCents;

  const handlePay = () => {
    if (isCartEmpty || isSubmitting || isUnderpaid) return;
    onCheckout(selectedMethod, selectedMethod === 'CASH' ? tenderAmount : undefined, qrReference);
  };

  return (
    <Card className="border-border bg-card shadow-sm" data-testid="pos-payment-panel">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Payment & Checkout
          </span>
          <span className="text-xs font-mono font-bold text-primary">
            Payable: {formatMoneyCents(netTotalCents, currency)}
          </span>
        </div>

        {/* Payment Method Selector */}
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Payment Method">
          <button
            type="button"
            role="radio"
            aria-checked={selectedMethod === 'CASH'}
            disabled={isSubmitting || isCartEmpty}
            onClick={() => setSelectedMethod('CASH')}
            className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-semibold transition-all ${
              selectedMethod === 'CASH'
                ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500'
                : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
            } ${isCartEmpty ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            data-testid="pos-pay-cash-btn"
          >
            <Banknote className="h-4 w-4" /> CASH Tender
          </button>

          <button
            type="button"
            role="radio"
            aria-checked={selectedMethod === 'QR'}
            disabled={isSubmitting || isCartEmpty}
            onClick={() => setSelectedMethod('QR')}
            className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-semibold transition-all ${
              selectedMethod === 'QR'
                ? 'border-blue-500 bg-blue-500/10 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500'
                : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
            } ${isCartEmpty ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
            data-testid="pos-pay-qr-btn"
          >
            <QrCode className="h-4 w-4" /> QR Digital
          </button>
        </div>

        {/* CASH Details: Tender & Change Calculation */}
        {selectedMethod === 'CASH' && !isCartEmpty && (
          <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <label htmlFor="pos-cash-tender" className="font-medium text-foreground">
                Cash Tendered ({currency}):
              </label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setTenderAmount(centsToDecimal(netTotalCents))}
                className="h-6 text-[11px] px-2"
                data-testid="pos-exact-cash-btn"
              >
                Exact ${centsToDecimal(netTotalCents).toFixed(2)}
              </Button>
            </div>

            <div className="relative">
              <DollarSign className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                id="pos-cash-tender"
                type="number"
                step="0.01"
                min={0}
                value={tenderAmount || ''}
                onChange={(e) => setTenderAmount(Number(e.target.value))}
                className="pl-8 h-8 text-xs font-mono font-bold"
                data-testid="pos-tender-input"
              />
            </div>

            {/* Quick Bill Buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {[10, 20, 50, 100].map((bill) => (
                <Button
                  key={bill}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTenderAmount(bill)}
                  className="h-6 text-[11px] px-2 font-mono"
                >
                  ${bill}
                </Button>
              ))}
            </div>

            {/* Change Calculation */}
            <div className="flex items-center justify-between pt-1 border-t border-border/50">
              <span className="text-muted-foreground font-medium">Change to Return:</span>
              <span
                className={`font-mono font-bold ${
                  isUnderpaid ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'
                }`}
                data-testid="pos-change-display"
              >
                {isUnderpaid ? 'Underpaid' : formatMoneyCents(changeCents, currency)}
              </span>
            </div>
            {isUnderpaid && (
              <p className="text-[11px] text-destructive">
                Tender amount must cover the total due ({formatMoneyCents(netTotalCents, currency)}
                ).
              </p>
            )}
          </div>
        )}

        {/* QR Details */}
        {selectedMethod === 'QR' && !isCartEmpty && (
          <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-2 text-xs">
            <p className="text-muted-foreground leading-relaxed text-[11px]">
              Customer will scan the POS counter dynamic QR code. Once confirmed, payment record
              initializes as PENDING tender.
            </p>
            <div>
              <label
                htmlFor="pos-qr-ref"
                className="text-[11px] text-muted-foreground block mb-0.5"
              >
                QR Transaction Reference (Optional)
              </label>
              <Input
                id="pos-qr-ref"
                type="text"
                placeholder="e.g. QR-TXN-001 or bank authorization"
                value={qrReference}
                onChange={(e) => setQrReference(e.target.value)}
                className="h-7 text-xs"
                data-testid="pos-qr-ref-input"
              />
            </div>
          </div>
        )}

        {/* Execution Error Message */}
        {errorMessage && (
          <div
            className="p-3 rounded-md border border-destructive/30 bg-destructive/10 text-destructive text-xs flex items-start gap-2"
            role="alert"
            data-testid="pos-error-banner"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold block">Checkout Failed</span>
              <span>{errorMessage}</span>
            </div>
          </div>
        )}

        {/* In-Flight Progress Status */}
        {isSubmitting && (
          <div
            className="p-2.5 rounded-md border border-primary/20 bg-primary/5 text-xs text-primary flex items-center gap-2"
            data-testid="pos-progress-status"
          >
            <Spinner className="h-4 w-4" />
            <span className="font-medium">{statusMessage || 'Processing transaction...'}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 pt-1">
          <Button
            type="button"
            disabled={isCartEmpty || isSubmitting || isUnderpaid}
            onClick={handlePay}
            className="w-full h-10 text-xs font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            data-testid="pos-complete-sale-btn"
          >
            {isSubmitting ? (
              <>
                <Spinner className="h-4 w-4" /> Processing...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" /> Complete Sale (
                {formatMoneyCents(netTotalCents, currency)})
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            disabled={isCartEmpty || isSubmitting}
            onClick={onSaveDraft}
            className="w-full h-8 text-xs text-muted-foreground hover:text-foreground gap-1.5"
            data-testid="pos-save-draft-btn"
          >
            <FileText className="h-3.5 w-3.5" /> Save as Draft Order (Pay Later)
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
