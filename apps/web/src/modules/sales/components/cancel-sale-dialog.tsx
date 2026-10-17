import React from 'react';
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
import { cancelSaleSchema, type CancelSaleFormData } from '../schemas/cancel-sale.schema';

export interface CancelSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saleId: string;
  isSubmitting?: boolean;
  onConfirm: (reason: string) => Promise<void> | void;
}

export const CancelSaleDialog: React.FC<CancelSaleDialogProps> = ({
  open,
  onOpenChange,
  saleId,
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
    formState: { errors },
  } = useForm<CancelSaleFormData>({
    resolver: zodResolver(cancelSaleSchema),
    defaultValues: { reason: '' },
  });

  const onSubmit = async (data: CancelSaleFormData) => {
    if (isSubmitting) return;
    setSubmissionError(null);

    try {
      await onConfirm(data.reason);
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
        'Failed to cancel sale order.';
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
      <DialogContent data-testid="cancel-sale-dialog">
        <DialogHeader>
          <DialogTitle>Cancel Commercial Sale</DialogTitle>
          <DialogDescription>
            Are you sure you want to cancel sale order{' '}
            <span className="font-mono font-medium">{saleId}</span>? This action is irreversible. A
            commercial cancellation reason is required for audit logs.
          </DialogDescription>
        </DialogHeader>

        {submissionError && (
          <div
            className={`p-3 rounded-md text-xs border space-y-1 ${
              submissionError.isAmbiguous
                ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400'
                : 'border-destructive/30 bg-destructive/10 text-destructive'
            }`}
            data-testid="cancel-sale-error"
            role="alert"
          >
            <p className="font-semibold">{submissionError.message}</p>
            {submissionError.isAmbiguous && (
              <p className="text-[11px] text-muted-foreground">
                A network interruption occurred. Please inspect the sale agreement status before
                retrying to prevent ambiguous state changes.
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
              data-testid="cancellation-reason-input"
            />
            {errors.reason && <p className="text-xs text-destructive">{errors.reason.message}</p>}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isSubmitting}
              onClick={() => onOpenChange(false)}
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
              {isSubmitting ? 'Cancelling...' : 'Confirm Cancellation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
