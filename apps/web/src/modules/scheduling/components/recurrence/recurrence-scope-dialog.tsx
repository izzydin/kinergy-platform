import React from 'react';
import { Button } from '@kinergy-platform/ui';
import { CalendarDays, CalendarRange, RotateCcw, X, ArrowRight } from 'lucide-react';
import type { AppointmentModel, CalendarSlotDTO } from '../../types/scheduling.types';
import { formatFacilityDate, formatFacilityTime } from '../../utils/calendar-date.utils';

export type RecurrenceScopeAction = 'edit-single' | 'edit-future' | 'skip-single' | 'cancel-series';

export interface RecurrenceScopeDialogProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: AppointmentModel | CalendarSlotDTO;
  actionType: 'edit' | 'cancel';
  onSelectScope: (action: RecurrenceScopeAction) => void;
}

export const RecurrenceScopeDialog: React.FC<RecurrenceScopeDialogProps> = ({
  isOpen,
  onClose,
  appointment,
  actionType,
  onSelectScope,
}) => {
  if (!isOpen) return null;

  const occurrenceIndex =
    'occurrenceIndex' in appointment && appointment.occurrenceIndex !== undefined
      ? appointment.occurrenceIndex + 1
      : null;

  const dateLabel = formatFacilityDate(appointment.startTime);
  const timeLabel = formatFacilityTime(appointment.startTime);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recurrence-scope-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center text-primary">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </div>
            <div>
              <h2 id="recurrence-scope-title" className="text-base font-bold text-foreground">
                {actionType === 'edit'
                  ? 'Edit Recurring Appointment'
                  : 'Cancel Recurring Appointment'}
              </h2>
              <p className="text-xs text-muted-foreground">
                Occurrence {occurrenceIndex ? `#${occurrenceIndex}` : ''} • {dateLabel} at{' '}
                {timeLabel}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content & Choices */}
        <div className="p-5 space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            This appointment is part of an active recurring series. Please choose the authoritative
            scope for your changes:
          </p>

          <div className="space-y-3">
            {actionType === 'edit' ? (
              <>
                {/* Scope 1: This Occurrence Only */}
                <button
                  type="button"
                  onClick={() => onSelectScope('edit-single')}
                  className="w-full flex items-start gap-3.5 p-3.5 rounded-lg border border-border bg-background hover:bg-muted/50 hover:border-primary/50 text-left transition-all group focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="h-9 w-9 rounded-md bg-blue-500/10 text-blue-600 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">
                        This occurrence only
                      </h3>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Detaches this specific appointment from the recurring series. All past and
                      future recurring appointments remain completely untouched.
                    </p>
                    <span className="inline-block mt-2 text-[10px] uppercase font-semibold tracking-wider text-blue-600 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-900">
                      Detached Occurrence • Modified Exception
                    </span>
                  </div>
                </button>

                {/* Scope 2: This and Future Occurrences (Cutoff & Fork) */}
                <button
                  type="button"
                  onClick={() => onSelectScope('edit-future')}
                  className="w-full flex items-start gap-3.5 p-3.5 rounded-lg border border-border bg-background hover:bg-muted/50 hover:border-primary/50 text-left transition-all group focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="h-9 w-9 rounded-md bg-purple-500/10 text-purple-600 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                    <CalendarRange className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">
                        This and all future occurrences
                      </h3>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Terminates the previous series at this date and forks a new recurring series
                      starting today. Past completed sessions remain preserved.
                    </p>
                    <span className="inline-block mt-2 text-[10px] uppercase font-semibold tracking-wider text-purple-600 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-900">
                      Cutoff & Fork • Series Branch
                    </span>
                  </div>
                </button>
              </>
            ) : (
              <>
                {/* Scope 1: Skip This Occurrence Only */}
                <button
                  type="button"
                  onClick={() => onSelectScope('skip-single')}
                  className="w-full flex items-start gap-3.5 p-3.5 rounded-lg border border-border bg-background hover:bg-muted/50 hover:border-destructive/50 text-left transition-all group focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="h-9 w-9 rounded-md bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-foreground">
                        Skip this occurrence only
                      </h3>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Cancels only this scheduled session and records a skipped slot exception.
                      Subsequent recurring appointments will continue as scheduled.
                    </p>
                    <span className="inline-block mt-2 text-[10px] uppercase font-semibold tracking-wider text-amber-600 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-900">
                      Slot Exception • Skipped
                    </span>
                  </div>
                </button>

                {/* Scope 2: Cancel Entire Series */}
                <button
                  type="button"
                  onClick={() => onSelectScope('cancel-series')}
                  className="w-full flex items-start gap-3.5 p-3.5 rounded-lg border border-border bg-background hover:bg-destructive/5 hover:border-destructive/50 text-left transition-all group focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <div className="h-9 w-9 rounded-md bg-destructive/10 text-destructive flex items-center justify-center shrink-0 mt-0.5 group-hover:scale-105 transition-transform">
                    <RotateCcw className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-destructive">
                        Cancel entire series
                      </h3>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Cancels all future scheduled appointments in this recurring series. Past
                      completed appointments remain intact in clinical history.
                    </p>
                    <span className="inline-block mt-2 text-[10px] uppercase font-semibold tracking-wider text-destructive bg-destructive/10 px-2 py-0.5 rounded border border-destructive/20">
                      Full Series Cancellation
                    </span>
                  </div>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-border bg-muted/10">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};
