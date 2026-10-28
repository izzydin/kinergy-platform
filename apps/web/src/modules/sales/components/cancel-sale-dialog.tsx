import React, { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Button,
  Input,
} from '@kinergy-platform/ui';
import { AlertCircle, ShieldAlert, Scale, RefreshCw } from 'lucide-react';
import { useDirtyDialogGuard, ConfirmDiscardDialog } from '../../../shared/forms';
import { cancelSaleSchema, type CancelSaleFormData } from '../schemas/cancel-sale.schema';
import type { PaymentSummaryDTO } from '../types/payments.types';
import type { MoneyDTO } from '../types/sales.types';

export interface CancelSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string;
  status?: string;
  itemCount?: number;
  total?: number | MoneyDTO;
  currency?: string;
  payments?: PaymentSummaryDTO[] | null;
  isSubmitting?: boolean;
  onConfirm: (reason: string) => Promise<void> | void;
}

export const CancelSaleDialog: React.FC<CancelSaleDialogProps> = ({
  open,
  onOpenChange,
  saleId,
  itemCount,
  total,
  currency,
  payments,
  isSubmitting = false,
  onConfirm,
}) => {
  const [submissionError, setSubmissionError] = React.useState<{
    message: string;
    isAmbiguous?: boolean;
    isConflict?: boolean;
    isInvalidTransition?: boolean;
  } | null>(null);

  const pendingPayments = useMemo(
    () => payments?.filter((p) => p.status === 'PENDING') ?? [],
    [payments],
  );
  const completedPayments = useMemo(
    () => payments?.filter((p) => p.status === 'COMPLETED') ?? [],
    [payments],
  );
  const completedTotal = useMemo(
    () => completedPayments.reduce((acc, p) => acc + (p.amountValue ?? 0), 0),
    [completedPayments],
  );

  const formattedTotal = useMemo(() => {
    if (total === undefined || total === null) return '0.00';
    if (typeof total === 'number') return total.toFixed(2);
    return total.amount.toFixed(2);
  }, [total]);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitSuccessful },
  } = useForm<CancelSaleFormData>({
    resolver: zodResolver(cancelSaleSchema),
    defaultValues: { reason: '' },
  });

  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } = useDirtyDialogGuard(
    {
      isDirty,
      isSubmitSuccessful,
      onClose: () => {
        setSubmissionError(null);
        reset({ reason: '' });
        onOpenChange(false);
      },
    },
  );

  useEffect(() => {
    if (open) {
      setSubmissionError(null);
      reset({ reason: '' });
    }
  }, [open, reset]);

  const onSubmit = async (data: CancelSaleFormData) => {
    if (isSubmitting) return;
    setSubmissionError(null);

    try {
      await onConfirm(data.reason);
      reset({ reason: '' });
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
        'Failed to cancel sale order.';
      const message = Array.isArray(rawMessage) ? rawMessage.join(', ') : String(rawMessage);

      const isConflict =
        status === 409 ||
        message.toLowerCase().includes('duplicate') ||
        message.toLowerCase().includes('conflict') ||
        message.toLowerCase().includes('concurrent') ||
        message.toLowerCase().includes('optimistic');

      const isInvalidTransition =
        status === 422 ||
        message.toLowerCase().includes('cannot be cancelled') ||
        message.toLowerCase().includes('invalid sale transition') ||
        message.toLowerCase().includes('already cancelled') ||
        message.toLowerCase().includes('already settled') ||
        message.toLowerCase().includes('paid');

      const isAmbiguous =
        !status ||
        status === 0 ||
        message.toLowerCase().includes('network') ||
        message.toLowerCase().includes('timeout') ||
        message.toLowerCase().includes('fetch');

      setSubmissionError({ message, isAmbiguous, isConflict, isInvalidTransition });
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (isSubmitting) return;
          guardedOnOpenChange(nextOpen);
        }}
      >
        <DialogContent
          data-testid="cancel-sale-dialog"
          hideCloseButton={isSubmitting}
          onEscapeKeyDown={(e) => {
            if (isSubmitting) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (isSubmitting) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>Cancel Commercial Sale</DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel sale order{' '}
              <span className="font-mono font-medium">{saleId}</span>? This action is irreversible.
              A commercial cancellation reason is required for audit logs.
            </DialogDescription>
          </DialogHeader>

          {/* Consequential domain notices */}
          {pendingPayments.length > 0 && (
            <div
              className="p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300 text-xs space-y-0.5"
              data-testid="cancel-pending-tenders-notice"
            >
              <div className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Active Pending Payment Tenders
              </div>
              <p className="text-[11px] opacity-90">
                There{' '}
                {pendingPayments.length === 1
                  ? 'is 1 active pending tender'
                  : `are ${pendingPayments.length} active pending tenders`}
                . Cascading cancellation will cancel {pendingPayments.length === 1 ? 'it' : 'them'}{' '}
                immediately to prevent orphaned payment records.
              </p>
            </div>
          )}

          {completedPayments.length > 0 && (
            <div
              className="p-2.5 rounded-lg border border-border bg-muted/50 text-xs text-foreground space-y-0.5"
              data-testid="cancel-completed-tenders-notice"
            >
              <div className="font-semibold flex items-center gap-1.5">
                <Scale className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                Historical Payments Preserved
              </div>
              <p className="text-[11px] text-muted-foreground">
                {completedPayments.length} completed payment record(s) totalling {currency ?? ''}{' '}
                {completedTotal.toFixed(2)} will remain preserved in the ledger for financial
                auditability and will <strong>not</strong> be automatically refunded.
              </p>
            </div>
          )}

          <div
            className="p-2.5 rounded-lg border border-border bg-muted/30 text-[11px] text-muted-foreground space-y-0.5"
            data-testid="cancel-history-preservation-notice"
          >
            <span className="font-medium text-foreground block">
              Financial History Preservation:
            </span>
            <span>
              Original line item snapshots
              {itemCount !== undefined ? ` (${itemCount} item${itemCount === 1 ? '' : 's'})` : ''},
              discounts, and order total ({currency ?? ''} {formattedTotal}) will remain permanently
              recorded in the sales ledger for auditing.
            </span>
          </div>

          {submissionError && (
            <div
              className={`p-3 rounded-md text-xs border space-y-1 ${
                submissionError.isConflict || submissionError.isInvalidTransition
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                  : submissionError.isAmbiguous
                    ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                    : 'border-destructive/30 bg-destructive/10 text-destructive'
              }`}
              data-testid="cancel-sale-error"
              role="alert"
            >
              <div className="flex items-center gap-1.5 font-semibold">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                {submissionError.isConflict
                  ? 'Concurrency Conflict'
                  : submissionError.isInvalidTransition
                    ? 'Invalid Lifecycle Transition'
                    : submissionError.isAmbiguous
                      ? 'Ambiguous Network Outcome'
                      : 'Cancellation Request Rejected'}
              </div>
              <p>{submissionError.message}</p>
              {submissionError.isConflict && (
                <p className="text-[11px] opacity-90">
                  A concurrency conflict occurred. This sale agreement may have already been
                  modified or cancelled concurrently. Please refresh the sales ledger before
                  retrying.
                </p>
              )}
              {submissionError.isInvalidTransition && (
                <p className="text-[11px] opacity-90">
                  This sale agreement is in a state that cannot be cancelled (e.g. already settled,
                  paid, or cancelled). Please inspect the current authoritative sale status.
                </p>
              )}
              {submissionError.isAmbiguous &&
                !submissionError.isConflict &&
                !submissionError.isInvalidTransition && (
                  <p className="text-[11px] opacity-90">
                    A network interruption occurred while submitting cancellation. Because the
                    server may have already committed the cancellation, please inspect the agreement
                    before attempting to resubmit.
                  </p>
                )}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label htmlFor="cancellation-reason" className="text-sm font-medium">
                Cancellation Reason <span className="text-destructive">*</span>
              </label>
              <Input
                id="cancellation-reason"
                placeholder="e.g. Customer changed mind, incorrect product added"
                {...register('reason')}
                disabled={isSubmitting}
                autoFocus
                aria-required="true"
                aria-invalid={Boolean(errors.reason)}
                aria-describedby={errors.reason ? 'cancellation-reason-error' : undefined}
                data-testid="cancellation-reason-input"
              />
              {errors.reason && (
                <p id="cancellation-reason-error" role="alert" className="text-xs text-destructive">
                  {errors.reason.message}
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => guardedOnOpenChange(false)}
              >
                Back
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={isSubmitting}
                className="gap-1.5"
                data-testid="confirm-cancel-sale-btn"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" /> Cancelling...
                  </>
                ) : (
                  'Confirm Cancellation'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDiscardDialog
        open={isConfirmOpen}
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
        title="Discard cancellation reason?"
        description="You have unsaved changes in the cancellation reason. Are you sure you want to discard them?"
      />
    </>
  );
};
