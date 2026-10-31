import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
} from '@kinergy-platform/ui';
import { cancelSessionSchema, CancelSessionFormData } from '../schemas/cancel-session.schema';

export interface CancelSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmCancel: (data: CancelSessionFormData) => Promise<void> | void;
  isLoading?: boolean;
  error?: Error | null;
}

export const CancelSessionModal: React.FC<CancelSessionModalProps> = ({
  isOpen,
  onClose,
  onConfirmCancel,
  isLoading = false,
  error = null,
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CancelSessionFormData>({
    resolver: zodResolver(cancelSessionSchema),
    defaultValues: {
      reason: '',
    },
  });

  const onSubmit = async (data: CancelSessionFormData) => {
    try {
      await onConfirmCancel(data);
      reset();
      onClose();
    } catch {
      // Reason input preserved on failure for retry
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive font-bold">Cancel Treatment Session</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Cancelling will transition the session to CANCELLED status. A valid cancellation reason
            is required for medico-legal audit trails.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div
            className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-destructive text-xs"
            role="alert"
            data-testid="cancel-error-banner"
          >
            <p className="font-semibold">Cancellation Failed</p>
            <p className="mt-0.5">
              {error.message || 'An error occurred while cancelling the session.'}
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-1">
            <label htmlFor="cancellation-reason" className="text-sm font-medium text-foreground">
              Cancellation Reason
            </label>
            <textarea
              id="cancellation-reason"
              {...register('reason')}
              disabled={isLoading}
              rows={3}
              aria-required="true"
              aria-invalid={errors.reason ? true : undefined}
              aria-describedby={errors.reason ? 'cancellation-reason-error' : undefined}
              className="w-full rounded-md border border-input bg-background p-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              placeholder="Provide reason (e.g. Patient requested cancellation, practitioner unavailable)..."
            />
            {errors.reason && (
              <p
                id="cancellation-reason-error"
                role="alert"
                className="text-xs text-destructive font-medium"
              >
                {errors.reason.message}
              </p>
            )}
          </div>

          <DialogFooter className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Back
            </Button>
            <Button type="submit" variant="destructive" disabled={isLoading}>
              {isLoading ? 'Cancelling...' : 'Confirm Cancellation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
