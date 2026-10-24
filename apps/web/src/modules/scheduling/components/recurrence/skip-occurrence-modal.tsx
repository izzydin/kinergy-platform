import React, { useState } from 'react';
import { Alert, AlertDescription, AlertTitle, Button } from '@kinergy-platform/ui';
import { AlertCircle, CalendarDays, X } from 'lucide-react';
import type { AppointmentModel, CalendarSlotDTO } from '../../types/scheduling.types';
import { formatFacilityDate, formatFacilityTime } from '../../utils/calendar-date.utils';
import { useSkipOccurrenceMutation } from '../../hooks/use-scheduling-mutations';
import { formatSchedulingErrorMessage } from '../../api/scheduling-error';

export interface SkipOccurrenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: AppointmentModel | CalendarSlotDTO;
  onSuccess?: () => void;
}

export const SkipOccurrenceModal: React.FC<SkipOccurrenceModalProps> = ({
  isOpen,
  onClose,
  appointment,
  onSuccess,
}) => {
  const skipMutation = useSkipOccurrenceMutation();

  const seriesId = 'seriesId' in appointment && appointment.seriesId ? appointment.seriesId : '';
  const occurrenceIndex =
    'occurrenceIndex' in appointment && appointment.occurrenceIndex !== undefined
      ? appointment.occurrenceIndex
      : 0;

  const [reason, setReason] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  if (!isOpen || !seriesId) return null;

  const dateLabel = formatFacilityDate(appointment.startTime);
  const timeLabel = formatFacilityTime(appointment.startTime);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setServerError('A reason for skipping this occurrence is required.');
      return;
    }

    setServerError(null);

    skipMutation.mutate(
      {
        seriesId,
        payload: {
          occurrenceIndex,
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
      aria-labelledby="skip-occurrence-title"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-muted/20">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-md bg-amber-500/10 flex items-center justify-center text-amber-600">
                <CalendarDays className="h-4 w-4" />
              </div>
              <div>
                <h2 id="skip-occurrence-title" className="text-base font-bold text-foreground">
                  Skip Occurrence #{occurrenceIndex + 1}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {dateLabel} at {timeLabel}
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
                <AlertTitle className="font-semibold">Unable to Skip Occurrence</AlertTitle>
                <AlertDescription className="mt-1">{serverError}</AlertDescription>
              </Alert>
            )}

            <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 p-3 text-xs text-amber-900 dark:text-amber-300">
              <p className="font-semibold">Authoritative Skip Exception Semantics</p>
              <p className="text-[11px] mt-0.5 text-amber-800 dark:text-amber-400">
                This cancels this specific appointment and registers a SKIPPED exception on parent
                series ID <code>{seriesId.slice(0, 8)}</code>. The recurrence pattern continues
                intact for all subsequent occurrences.
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="skip-reason" className="text-xs font-medium text-foreground">
                Reason for Skipping (Mandatory) <span className="text-destructive">*</span>
              </label>
              <textarea
                id="skip-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Client away on travel; requested skipping session"
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
              disabled={skipMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={skipMutation.isPending || !reason.trim()}
              className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
            >
              {skipMutation.isPending ? 'Skipping Occurrence...' : 'Skip Occurrence'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
