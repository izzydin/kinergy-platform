import React, { useState } from 'react';
import { Alert, AlertDescription, AlertTitle, Button } from '@kinergy-platform/ui';
import { AlertCircle, Calendar, Clock, Wrench, X } from 'lucide-react';
import type { RoomModel } from '../../types/scheduling.types';
import { useScheduleMaintenanceMutation } from '../../hooks/use-scheduling-mutations';
import { formatSchedulingErrorMessage } from '../../api/scheduling-error';
import {
  FACILITY_TIMEZONE,
  facilityDateTimeToUtcIso,
  getTodayFacilityDate,
} from '../../utils/calendar-date.utils';
import { scheduleMaintenanceSchema } from '../../schemas/room-management.schema';

export interface ScheduleMaintenanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: RoomModel | null;
  onSuccess?: (updated: RoomModel) => void;
}

export const ScheduleMaintenanceModal: React.FC<ScheduleMaintenanceModalProps> = ({
  isOpen,
  onClose,
  room,
  onSuccess,
}) => {
  const maintenanceMutation = useScheduleMaintenanceMutation();

  const [date, setDate] = useState<string>(() => getTodayFacilityDate());
  const [startTime, setStartTime] = useState('12:00');
  const [endTime, setEndTime] = useState('14:00');
  const [reason, setReason] = useState('');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  if (!isOpen || !room) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setClientErrors({});
    setServerError(null);

    const validation = scheduleMaintenanceSchema.safeParse({
      date,
      startTime,
      endTime,
      reason,
      expectedVersion: room.version,
    });

    if (!validation.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of validation.error.issues) {
        const path = issue.path[0];
        if (path && typeof path === 'string') {
          fieldErrors[path] = issue.message;
        }
      }
      setClientErrors(fieldErrors);
      return;
    }

    // Authoritative conversion from facility local timezone (America/New_York) to UTC ISO
    const startUtcIso = facilityDateTimeToUtcIso(date, startTime);
    const endUtcIso = facilityDateTimeToUtcIso(date, endTime);

    maintenanceMutation.mutate(
      {
        id: room.id,
        payload: {
          startTime: startUtcIso,
          endTime: endUtcIso,
          reason: reason.trim(),
          expectedVersion: room.version,
        },
      },
      {
        onSuccess: (updated) => {
          onSuccess?.(updated);
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
      aria-labelledby="schedule-maintenance-title"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-muted/20">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-md bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
                <Wrench className="h-4 w-4" />
              </div>
              <div>
                <h3
                  id="schedule-maintenance-title"
                  className="text-sm font-semibold text-foreground"
                >
                  Schedule Maintenance Window
                </h3>
                <p className="text-xs text-muted-foreground">
                  Room: {room.name} ({FACILITY_TIMEZONE})
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={maintenanceMutation.isPending}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Form Body */}
          <div className="p-5 space-y-4">
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-amber-600" />
                <span>Temporal Booking Lockout</span>
              </p>
              <p className="text-[11px]">
                Scheduling a maintenance window blocks the room from new appointment reservations
                during this exact time window. Conflicting booking attempts will be rejected by the
                backend conflict detector.
              </p>
            </div>

            {serverError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Maintenance Scheduling Failed</AlertTitle>
                <AlertDescription className="text-xs mt-1">{serverError}</AlertDescription>
              </Alert>
            )}

            {/* Date */}
            <div className="space-y-1.5">
              <label
                htmlFor="maint-date"
                className="text-xs font-semibold text-foreground flex items-center gap-1.5"
              >
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                <span>
                  Maintenance Date ({FACILITY_TIMEZONE}) <span className="text-destructive">*</span>
                </span>
              </label>
              <input
                id="maint-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`w-full text-xs rounded-md border ${
                  clientErrors.date ? 'border-destructive' : 'border-input'
                } bg-background px-3 py-2 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring`}
                disabled={maintenanceMutation.isPending}
                required
              />
              {clientErrors.date && (
                <p className="text-[11px] text-destructive">{clientErrors.date}</p>
              )}
            </div>

            {/* Start & End Times */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor="maint-start-time" className="text-xs font-semibold text-foreground">
                  Start Time <span className="text-destructive">*</span>
                </label>
                <input
                  id="maint-start-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className={`w-full text-xs rounded-md border ${
                    clientErrors.startTime ? 'border-destructive' : 'border-input'
                  } bg-background px-3 py-2 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring`}
                  disabled={maintenanceMutation.isPending}
                  required
                />
                {clientErrors.startTime && (
                  <p className="text-[11px] text-destructive">{clientErrors.startTime}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="maint-end-time" className="text-xs font-semibold text-foreground">
                  End Time <span className="text-destructive">*</span>
                </label>
                <input
                  id="maint-end-time"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className={`w-full text-xs rounded-md border ${
                    clientErrors.endTime ? 'border-destructive' : 'border-input'
                  } bg-background px-3 py-2 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring`}
                  disabled={maintenanceMutation.isPending}
                  required
                />
                {clientErrors.endTime && (
                  <p className="text-[11px] text-destructive">{clientErrors.endTime}</p>
                )}
              </div>
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <label htmlFor="maint-reason" className="text-xs font-semibold text-foreground">
                Maintenance Explanation Reason <span className="text-destructive">*</span>
              </label>
              <textarea
                id="maint-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Water filtration inspection, deep sanitization, equipment recalibration..."
                className={`w-full text-xs rounded-md border ${
                  clientErrors.reason ? 'border-destructive' : 'border-input'
                } bg-background px-3 py-2 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring`}
                disabled={maintenanceMutation.isPending}
                required
              />
              {clientErrors.reason && (
                <p className="text-[11px] text-destructive">{clientErrors.reason}</p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2.5 border-t border-border px-5 py-3.5 bg-muted/20">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={maintenanceMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={maintenanceMutation.isPending || !reason.trim()}
              className="gap-1.5 bg-amber-600 hover:bg-amber-700 text-white"
            >
              {maintenanceMutation.isPending ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Scheduling...</span>
                </>
              ) : (
                <span>Schedule Maintenance</span>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
