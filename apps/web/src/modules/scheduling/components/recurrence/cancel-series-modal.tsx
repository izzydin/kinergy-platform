import React, { useState } from 'react';
import { Alert, AlertDescription, AlertTitle, Button } from '@kinergy-platform/ui';
import { AlertCircle, RotateCcw, X } from 'lucide-react';
import type { AppointmentModel, CalendarSlotDTO } from '../../types/scheduling.types';
import { useCancelRecurrenceSeriesMutation } from '../../hooks/use-scheduling-mutations';
import { formatSchedulingErrorMessage } from '../../api/scheduling-error';

export interface CancelSeriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: AppointmentModel | CalendarSlotDTO;
  onSuccess?: () => void;
}

export const CancelSeriesModal: React.FC<CancelSeriesModalProps> = ({
  isOpen,
  onClose,
  appointment,
  onSuccess,
}) => {
  const cancelSeriesMutation = useCancelRecurrenceSeriesMutation();

  const seriesId = 'seriesId' in appointment && appointment.seriesId ? appointment.seriesId : '';

  const [reason, setReason] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  if (!isOpen || !seriesId) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setServerError('A reason for cancelling the series is required.');
      return;
    }

    setServerError(null);

    cancelSeriesMutation.mutate(
      {
        seriesId,
        payload: {
          reason: reason.trim(),
        },
      },
      {
        onSuccess: () => {
          onSuccess?.();
          onClose();
        },
        onError: (err) => {
          setServerError(formatSchedulingErrorMessage(err));
        },
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-series-title"
    >
      <div className="w-full max-w-md rounded-xl border border-destructive/40 bg-card shadow-2xl overflow-hidden animate-in zoom-in-95">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-destructive/10">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-md bg-destructive/20 flex items-center justify-center text-destructive">
                <RotateCcw className="h-4 w-4" />
              </div>
              <div>
                <h2 id="cancel-series-title" className="text-base font-bold text-destructive">
                  Cancel Recurring Series
                </h2>
                <p className="text-xs text-muted-foreground">
                  Series ID:{' '}
                  <code className="bg-muted px-1 rounded">{seriesId.slice(0, 8)}...</code>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {serverError && (
              <Alert
                variant="destructive"
                className="border-destructive/40 bg-destructive/10 text-xs"
              >
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="font-semibold">Unable to Cancel Series</AlertTitle>
                <AlertDescription className="mt-1">{serverError}</AlertDescription>
              </Alert>
            )}

            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
              <p className="font-semibold">Consequential Cancellation Scope</p>
              <p className="text-[11px] mt-0.5 text-muted-foreground">
                All future scheduled and confirmed appointments belonging to this series will be
                cancelled immediately. All past completed appointments remain preserved in client
                billing and clinical records.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="cancel-series-reason" className="text-xs font-medium text-foreground">
                Reason for Series Cancellation (Mandatory){' '}
                <span className="text-destructive">*</span>
              </label>
              <textarea
                id="cancel-series-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Client completed treatment plan early; series no longer needed"
                rows={2}
                className="w-full text-xs rounded-md border border-input bg-background p-2.5 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                required
                autoFocus
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/10">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={cancelSeriesMutation.isPending}
            >
              Dismiss
            </Button>
            <Button
              type="submit"
              size="sm"
              variant="destructive"
              disabled={cancelSeriesMutation.isPending || !reason.trim()}
              className="inline-flex items-center gap-1.5"
            >
              {cancelSeriesMutation.isPending ? 'Cancelling Series...' : 'Cancel Entire Series'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
