import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  Button,
} from '@kinergy-platform/ui';
import { cancelSessionSchema, CancelSessionFormData } from '../schemas/cancel-session.schema';

interface CancelSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmCancel: (data: CancelSessionFormData) => Promise<void> | void;
  isLoading?: boolean;
}

export const CancelSessionModal: React.FC<CancelSessionModalProps> = ({
  isOpen,
  onClose,
  onConfirmCancel,
  isLoading = false,
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
    await onConfirmCancel(data);
    reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-red-600">Cancel Treatment Session</DialogTitle>
          <p className="text-sm text-slate-500">
            Cancelling will transition the session to CANCELLED status. A valid cancellation reason
            is required for medico-legal audit trails.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Cancellation Reason</label>
            <textarea
              {...register('reason')}
              disabled={isLoading}
              rows={3}
              className="w-full rounded-md border border-slate-300 p-2 text-sm shadow-sm focus:border-red-500 focus:ring-1 focus:ring-red-500"
              placeholder="Provide reason (e.g. Patient requested cancellation, practitioner unavailable)..."
            />
            {errors.reason && <p className="text-xs text-red-600">{errors.reason.message}</p>}
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
