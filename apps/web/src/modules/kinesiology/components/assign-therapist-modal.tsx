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
import { assignTherapistSchema, AssignTherapistFormData } from '../schemas/assign-therapist.schema';

interface AssignTherapistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssign: (data: AssignTherapistFormData) => Promise<void> | void;
  currentTherapistId?: string;
  isLoading?: boolean;
  eligibleTherapists?: Array<{ id: string; name: string }>;
}

export const AssignTherapistModal: React.FC<AssignTherapistModalProps> = ({
  isOpen,
  onClose,
  onAssign,
  currentTherapistId,
  isLoading = false,
  eligibleTherapists = [],
}) => {
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<AssignTherapistFormData>({
    resolver: zodResolver(assignTherapistSchema),
    defaultValues: {
      newTherapistId: currentTherapistId ?? '',
    },
  });

  const onSubmit = async (data: AssignTherapistFormData) => {
    await onAssign(data);
    reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign / Handover Therapist</DialogTitle>
          <p className="text-sm text-slate-500">
            Reassigning a session handovers clinical documentation responsibility to the selected
            practitioner.
          </p>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">Select Eligible Therapist</label>
            {eligibleTherapists.length > 0 ? (
              <select
                {...register('newTherapistId')}
                disabled={isLoading}
                className="w-full rounded-md border border-slate-300 p-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">-- Choose practitioner --</option>
                {eligibleTherapists.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                {...register('newTherapistId')}
                disabled={isLoading}
                placeholder="Enter Therapist UUID"
                className="w-full rounded-md border border-slate-300 p-2 text-sm shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
              />
            )}
            {errors.newTherapistId && (
              <p className="text-xs text-red-600">{errors.newTherapistId.message}</p>
            )}
          </div>

          <DialogFooter className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" variant="default" disabled={isLoading}>
              {isLoading ? 'Assigning...' : 'Confirm Handover'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
