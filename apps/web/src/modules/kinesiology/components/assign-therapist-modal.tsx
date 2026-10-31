import React, { useState, useEffect } from 'react';
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
import { assignTherapistSchema, AssignTherapistFormData } from '../schemas/assign-therapist.schema';
import {
  getKinesiologyErrorMessage,
  isOptimisticConcurrencyConflict,
  isStateTransitionConflict,
} from '../api/kinesiology-error';

export interface AssignTherapistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssign: (data: AssignTherapistFormData) => Promise<void> | void;
  currentTherapistId?: string;
  sessionStatus?: string;
  isLoading?: boolean;
  error?: unknown;
  onRefresh?: () => void;
  eligibleTherapists?: Array<{ id: string; name: string }>;
}

export const AssignTherapistModal: React.FC<AssignTherapistModalProps> = ({
  isOpen,
  onClose,
  onAssign,
  currentTherapistId,
  sessionStatus,
  isLoading = false,
  error = null,
  onRefresh,
  eligibleTherapists = [],
}) => {
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
    setError,
    watch,
  } = useForm<AssignTherapistFormData>({
    resolver: zodResolver(assignTherapistSchema),
    defaultValues: {
      newTherapistId: '',
    },
  });

  const selectedTherapistId = watch('newTherapistId');

  useEffect(() => {
    if (!isOpen) {
      setHasConfirmed(false);
      setConfirmationError(null);
    }
  }, [isOpen]);

  const handleClose = () => {
    reset({ newTherapistId: '' });
    setHasConfirmed(false);
    setConfirmationError(null);
    onClose();
  };

  const onSubmit = async (data: AssignTherapistFormData) => {
    if (data.newTherapistId.trim() === currentTherapistId?.trim()) {
      setError('newTherapistId', {
        type: 'manual',
        message: 'Selected practitioner is already assigned to this session.',
      });
      return;
    }

    if (!hasConfirmed) {
      setConfirmationError('You must acknowledge and confirm the clinical handover.');
      return;
    }

    setConfirmationError(null);
    try {
      await onAssign(data);
      handleClose();
    } catch {
      // Error is caught; form input is preserved and error alert is displayed
    }
  };

  const errorMessage = error ? getKinesiologyErrorMessage(error) : null;
  const isConflict = error
    ? isOptimisticConcurrencyConflict(error) || isStateTransitionConflict(error)
    : false;

  const selectedTherapistObj = eligibleTherapists.find((t) => t.id === selectedTherapistId);
  const selectedTherapistDisplayName = selectedTherapistObj?.name ?? selectedTherapistId;

  const isSameTherapist =
    Boolean(selectedTherapistId) && selectedTherapistId.trim() === currentTherapistId?.trim();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground font-bold">
            Assign / Handover Therapist
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Reassigning a session handovers clinical documentation responsibility to the selected
            practitioner.
          </DialogDescription>
        </DialogHeader>

        {sessionStatus === 'IN_PROGRESS' && (
          <div
            className="rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-3 text-amber-900 dark:text-amber-100 text-xs flex items-start space-x-2"
            role="status"
          >
            <span className="font-semibold shrink-0">Active Encounter Notice:</span>
            <span>
              This session is currently in progress. Reassigning will transfer active encounter
              charting and sign-off authority to the selected practitioner.
            </span>
          </div>
        )}

        {Boolean(error) && (
          <div
            className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-destructive text-xs space-y-1.5"
            role="alert"
            data-testid="assign-therapist-error-banner"
          >
            <p className="font-semibold">
              {isConflict ? 'Reassignment Conflict' : 'Assignment Failed'}
            </p>
            <p>{errorMessage}</p>
            {isConflict && (
              <p className="text-[11px] text-destructive/80">
                This session was updated concurrently by another user. Please review the updated
                assignment before retrying.
              </p>
            )}
            {isConflict && onRefresh && (
              <div className="pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => onRefresh()}
                >
                  Refresh Latest Session
                </Button>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-2">
          {/* Current Assigned Practitioner Info */}
          <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1">
            <span className="text-muted-foreground font-medium uppercase tracking-wider text-[10px]">
              Current Assigned Practitioner
            </span>
            <p className="font-mono font-semibold text-foreground text-sm">
              {currentTherapistId || 'Unassigned'}
            </p>
          </div>

          {/* New Therapist Selection */}
          <div className="space-y-1">
            <label htmlFor="newTherapistId" className="text-sm font-medium text-foreground">
              Select Replacement Practitioner
            </label>
            {eligibleTherapists.length > 0 ? (
              <select
                id="newTherapistId"
                {...register('newTherapistId')}
                disabled={isLoading}
                aria-invalid={errors.newTherapistId ? true : undefined}
                aria-describedby={errors.newTherapistId ? 'newTherapistId-error' : undefined}
                className="w-full rounded-md border border-input bg-background p-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">-- Choose practitioner --</option>
                {eligibleTherapists.map((t) => (
                  <option key={t.id} value={t.id} disabled={t.id === currentTherapistId}>
                    {t.name} {t.id === currentTherapistId ? '(Currently Assigned)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="newTherapistId"
                type="text"
                {...register('newTherapistId')}
                disabled={isLoading}
                aria-invalid={errors.newTherapistId ? true : undefined}
                aria-describedby={errors.newTherapistId ? 'newTherapistId-error' : undefined}
                placeholder="Enter Practitioner UUID or ID"
                className="w-full rounded-md border border-input bg-background p-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            )}
            {errors.newTherapistId && (
              <p
                id="newTherapistId-error"
                role="alert"
                className="text-xs text-destructive font-medium"
              >
                {errors.newTherapistId.message}
              </p>
            )}
            {isSameTherapist && !errors.newTherapistId && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Selected practitioner is already assigned to this session.
              </p>
            )}
          </div>

          {/* Proposed Handover Summary */}
          {selectedTherapistId && !isSameTherapist && selectedTherapistId.trim() !== '' && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-xs space-y-1.5 text-foreground">
              <p className="font-semibold text-primary">Proposed Handover Summary</p>
              <div className="flex items-center justify-between text-xs pt-0.5">
                <div>
                  <span className="text-muted-foreground text-[11px]">Current Clinician:</span>{' '}
                  <span className="font-mono font-medium">
                    {currentTherapistId || 'Unassigned'}
                  </span>
                </div>
                <span className="text-primary font-bold px-2">→</span>
                <div>
                  <span className="text-muted-foreground text-[11px]">New Clinician:</span>{' '}
                  <span className="font-mono font-medium">{selectedTherapistDisplayName}</span>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground pt-0.5">
                Advances clinical record version and emits immutable audit event.
              </p>
            </div>
          )}

          {/* Handover Confirmation Checkbox */}
          <div className="space-y-1 pt-1">
            <label className="flex items-start space-x-2 cursor-pointer text-xs text-foreground">
              <input
                type="checkbox"
                id="confirm-handover-checkbox"
                checked={hasConfirmed}
                onChange={(e) => {
                  setHasConfirmed(e.target.checked);
                  if (e.target.checked) setConfirmationError(null);
                }}
                disabled={isLoading}
                className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>
                I confirm the clinical handover of this session to the designated practitioner and
                acknowledge that this change will be recorded in the audit trail.
              </span>
            </label>
            {confirmationError && <p className="text-xs text-red-600 pl-6">{confirmationError}</p>}
          </div>

          <DialogFooter className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={handleClose} disabled={isLoading}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="default"
              disabled={isLoading || !hasConfirmed || !selectedTherapistId || isSameTherapist}
            >
              {isLoading ? 'Assigning...' : 'Confirm Handover'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
