import React, { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
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
import { AlertCircle, ShieldAlert, RefreshCw } from 'lucide-react';
import { useDirtyDialogGuard, ConfirmDiscardDialog } from '../../../shared/forms';

const cancelPaymentSchema = z.object({
  reason: z
    .string({ required_error: 'Void reason is required' })
    .trim()
    .min(3, 'Void reason must be at least 3 characters')
    .max(255, 'Void reason cannot exceed 255 characters'),
});

type CancelPaymentFormData = z.infer<typeof cancelPaymentSchema>;

export interface CancelPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentId: string;
  amountFormatted?: string;
  isSubmitting?: boolean;
  onConfirm: (reason: string) => Promise<void> | void;
}

const DEFAULT_VOID_REASON = 'Voided by authorized cashier';

export const CancelPaymentDialog: React.FC<CancelPaymentDialogProps> = ({
  open,
  onOpenChange,
  paymentId,
  amountFormatted,
  isSubmitting = false,
  onConfirm,
}) => {
  const [submissionError, setSubmissionError] = useState<{
    message: string;
    isAmbiguous?: boolean;
  } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitSuccessful },
  } = useForm<CancelPaymentFormData>({
    resolver: zodResolver(cancelPaymentSchema),
    defaultValues: { reason: DEFAULT_VOID_REASON },
  });

  const { guardedOnOpenChange, isConfirmOpen, confirmDiscard, cancelDiscard } = useDirtyDialogGuard(
    {
      isDirty,
      isSubmitSuccessful,
      onClose: () => {
        setSubmissionError(null);
        reset({ reason: DEFAULT_VOID_REASON });
        onOpenChange(false);
      },
    },
  );

  useEffect(() => {
    if (open) {
      setSubmissionError(null);
      reset({ reason: DEFAULT_VOID_REASON });
    }
  }, [open, reset]);

  const onSubmit = async (data: CancelPaymentFormData) => {
    if (isSubmitting) return;
    setSubmissionError(null);

    try {
      await onConfirm(data.reason);
      reset({ reason: DEFAULT_VOID_REASON });
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
        'Failed to void payment tender.';
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
    <>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (isSubmitting) return;
          guardedOnOpenChange(nextOpen);
        }}
      >
        <DialogContent
          data-testid="cancel-payment-dialog"
          hideCloseButton={isSubmitting}
          onEscapeKeyDown={(e) => {
            if (isSubmitting) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (isSubmitting) e.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <ShieldAlert className="h-5 w-5" /> Void Payment Tender
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to void payment tender{' '}
              <span className="font-mono font-medium text-foreground">{paymentId}</span>
              {amountFormatted ? ` (${amountFormatted})` : ''}? This operation is permanent and
              irreversible in accordance with financial audit controls.
            </DialogDescription>
          </DialogHeader>

          {submissionError && (
            <div
              className={`p-3 rounded-md text-xs border space-y-1 ${
                submissionError.isAmbiguous
                  ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                  : 'border-destructive/30 bg-destructive/10 text-destructive'
              }`}
              data-testid="cancel-payment-error"
              role="alert"
            >
              <div className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {submissionError.isAmbiguous ? 'Ambiguous Network Outcome' : 'Void Action Failed'}
              </div>
              <p>{submissionError.message}</p>
              {submissionError.isAmbiguous && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  A network interruption occurred while voiding this tender. Please refresh or
                  inspect the payment record status before attempting another operation.
                </p>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label htmlFor="void-reason" className="text-sm font-medium">
                Void Reason <span className="text-destructive">*</span>
              </label>
              <Input
                id="void-reason"
                placeholder="e.g. Entered in error, duplicate swipe, transaction reversed"
                {...register('reason')}
                disabled={isSubmitting}
                autoFocus
                aria-required="true"
                aria-invalid={Boolean(errors.reason)}
                aria-describedby={errors.reason ? 'void-reason-error' : undefined}
                data-testid="void-payment-reason-input"
              />
              {errors.reason && (
                <p id="void-reason-error" role="alert" className="text-xs text-destructive">
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
                Keep Tender
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={isSubmitting}
                className="gap-1.5"
                data-testid="confirm-void-payment-btn"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" /> Voiding Tender...
                  </>
                ) : (
                  'Confirm Void Tender'
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
        title="Discard void reason changes?"
        description="You have modified the void audit reason. Are you sure you want to discard your changes and keep this tender active?"
      />
    </>
  );
};
