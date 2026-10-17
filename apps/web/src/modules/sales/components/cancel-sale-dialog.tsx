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
    await onConfirm(data.reason);
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isSubmitting) {
          reset();
          onOpenChange(next);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancel Commercial Sale</DialogTitle>
          <DialogDescription>
            Are you sure you want to cancel sale order{' '}
            <span className="font-mono font-medium">{saleId}</span>? This action is irreversible. A
            commercial cancellation reason is required for audit logs.
          </DialogDescription>
        </DialogHeader>

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
            <Button type="submit" variant="destructive" disabled={isSubmitting}>
              {isSubmitting ? 'Cancelling...' : 'Confirm Cancellation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
