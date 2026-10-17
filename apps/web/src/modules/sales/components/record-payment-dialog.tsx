import React, { useEffect } from 'react';
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
import { recordPaymentSchema, type RecordPaymentFormData } from '../schemas/record-payment.schema';
import { VALID_PAYMENT_METHODS } from '../types/payments.types';

export interface RecordPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string;
  defaultAmount?: number;
  currency?: string;
  isSubmitting?: boolean;
  onConfirm: (data: RecordPaymentFormData) => Promise<void> | void;
}

export const RecordPaymentDialog: React.FC<RecordPaymentDialogProps> = ({
  open,
  onOpenChange,
  saleId,
  defaultAmount = 0,
  currency = 'USD',
  isSubmitting = false,
  onConfirm,
}) => {
  const [submissionError, setSubmissionError] = React.useState<{
    message: string;
    isAmbiguous?: boolean;
  } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<RecordPaymentFormData>({
    resolver: zodResolver(recordPaymentSchema),
    defaultValues: {
      method: 'CASH',
      amount: defaultAmount,
      reference: '',
    },
  });

  useEffect(() => {
    if (open && defaultAmount > 0) {
      setValue('amount', defaultAmount);
    }
  }, [open, defaultAmount, setValue]);

  const onSubmit = async (data: RecordPaymentFormData) => {
    if (isSubmitting) return;
    setSubmissionError(null);

    try {
      await onConfirm(data);
      reset();
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
        'Failed to record payment tender.';
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
      onOpenChange={(next) => {
        if (!isSubmitting) {
          setSubmissionError(null);
          reset();
          onOpenChange(next);
        }
      }}
    >
      <DialogContent data-testid="record-payment-dialog">
        <DialogHeader>
          <DialogTitle>Record Payment Tender</DialogTitle>
          <DialogDescription>
            Register tender payment against commercial sale{' '}
            <span className="font-mono font-medium">{saleId}</span>.
          </DialogDescription>
        </DialogHeader>

        {submissionError && (
          <div
            className={`p-3 rounded-md text-xs border space-y-1 ${
              submissionError.isAmbiguous
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                : 'border-destructive/30 bg-destructive/10 text-destructive'
            }`}
            data-testid="record-payment-error"
            role="alert"
          >
            <p className="font-semibold">{submissionError.message}</p>
            {submissionError.isAmbiguous && (
              <p className="text-[11px] text-muted-foreground">
                A network interruption occurred while recording this tender. Please check the sale's
                payment history to confirm whether the tender was recorded before re-submitting.
              </p>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label htmlFor="tender-method" className="text-sm font-medium">
              Tender Method <span className="text-destructive">*</span>
            </label>
            <select
              id="tender-method"
              {...register('method')}
              disabled={isSubmitting}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              {VALID_PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {method}
                </option>
              ))}
            </select>
            {errors.method && <p className="text-xs text-destructive">{errors.method.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="tender-amount" className="text-sm font-medium">
              Amount ({currency}) <span className="text-destructive">*</span>
            </label>
            <Input
              id="tender-amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              {...register('amount', { valueAsNumber: true })}
              disabled={isSubmitting}
            />
            {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="tender-reference" className="text-sm font-medium">
              Drawer Tag / Trace Reference
            </label>
            <Input
              id="tender-reference"
              placeholder="e.g. DRAWER-01, POS-REF-892"
              {...register('reference')}
              disabled={isSubmitting}
            />
            {errors.reference && (
              <p className="text-xs text-destructive">{errors.reference.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              disabled={isSubmitting}
              className="gap-1.5"
              data-testid="confirm-record-payment-btn"
            >
              {isSubmitting ? 'Recording...' : 'Record Tender'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
