import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle, Button } from '@kinergy-platform/ui';
import { AlertCircle, Calendar, Clock, MapPin, Stethoscope, X } from 'lucide-react';
import type { AppointmentModel, CalendarSlotDTO, RoomModel } from '../../types/scheduling.types';
import { FACILITY_TIMEZONE, facilityDateTimeToUtcIso } from '../../utils/calendar-date.utils';
import {
  useEditSingleOccurrenceMutation,
  useRescheduleAppointmentMutation,
} from '../../hooks/use-scheduling-mutations';
import { formatSchedulingErrorMessage } from '../../api/scheduling-error';

export interface EditSingleOccurrenceModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: AppointmentModel | CalendarSlotDTO;
  rooms?: RoomModel[];
  onSuccess?: (updated: AppointmentModel) => void;
}

export const EditSingleOccurrenceModal: React.FC<EditSingleOccurrenceModalProps> = ({
  isOpen,
  onClose,
  appointment,
  rooms = [],
  onSuccess,
}) => {
  const editSingleMutation = useEditSingleOccurrenceMutation();
  const rescheduleMutation = useRescheduleAppointmentMutation();

  const isRecurring = Boolean(
    'seriesId' in appointment && appointment.seriesId && !appointment.isDetachedFromSeries,
  );

  const apptId =
    ('appointmentId' in appointment && appointment.appointmentId
      ? appointment.appointmentId
      : appointment.id) || '';

  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('');
  const [therapistId, setTherapistId] = useState('');
  const [roomId, setRoomId] = useState('');
  const [reason, setReason] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  // Sync form state when modal opens or appointment changes
  useEffect(() => {
    if (isOpen && appointment) {
      const currentStartDate = appointment.startTime.slice(0, 10);
      const startObj = new Date(appointment.startTime);
      const hour24Formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: FACILITY_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const parts = hour24Formatter.formatToParts(startObj);
      const initialHour = parts.find((p) => p.type === 'hour')?.value ?? '10';
      const initialMinute = parts.find((p) => p.type === 'minute')?.value ?? '00';
      const initialTimeInput = `${initialHour}:${initialMinute}`;

      setNewDate(currentStartDate);
      setNewTime(initialTimeInput);
      setTherapistId(appointment.therapistId || '');
      setRoomId(appointment.roomId || '');
      setReason('');
      setServerError(null);
    }
  }, [isOpen, appointment]);

  // Handle Escape key inside modal with stopPropagation to isolate from parent drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const isPending = editSingleMutation.isPending || rescheduleMutation.isPending;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setServerError('A reason for rescheduling is mandatory for the audit trail.');
      return;
    }

    setServerError(null);

    // Compute UTC ISO newStartTime if date/time specified
    const computedNewStart =
      newDate && newTime ? facilityDateTimeToUtcIso(newDate, newTime) : undefined;

    if (!computedNewStart) {
      setServerError('Valid date and time are required.');
      return;
    }

    if (isRecurring) {
      editSingleMutation.mutate(
        {
          appointmentId: apptId,
          payload: {
            newStartTime: computedNewStart,
            newTherapistId: therapistId.trim() || undefined,
            newRoomId: roomId.trim() || undefined,
            rescheduleReason: trimmedReason,
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
    } else {
      // Calculate newEndTime preserving duration
      const durationMs =
        new Date(appointment.endTime).getTime() - new Date(appointment.startTime).getTime();
      const safeDuration = durationMs > 0 ? durationMs : 60 * 60 * 1000;
      const computedNewEnd = new Date(
        new Date(computedNewStart).getTime() + safeDuration,
      ).toISOString();

      rescheduleMutation.mutate(
        {
          id: apptId,
          payload: {
            newStartTime: computedNewStart,
            newEndTime: computedNewEnd,
            newRoomId: roomId.trim() || undefined,
            newTherapistId: therapistId.trim() || undefined,
            reason: trimmedReason,
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
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-single-title"
      data-testid="edit-single-occurrence-dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-muted/20">
            <div>
              <h2
                id="edit-single-title"
                className="text-base font-bold text-foreground"
                data-testid="edit-single-occurrence-title"
              >
                {isRecurring ? 'Reschedule Single Occurrence' : 'Reschedule Appointment'}
              </h2>
              <p className="text-xs text-muted-foreground">
                {isRecurring
                  ? 'Detaches this appointment from the series and saves modifications with conflict validation.'
                  : 'Update the date, time, therapist, or room with authoritative conflict validation.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
              aria-label="Close modal"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Server Error Alert */}
            {serverError && (
              <Alert
                variant="destructive"
                className="border-destructive/40 bg-destructive/10 text-xs"
              >
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="font-semibold">
                  {isRecurring
                    ? 'Unable to Reschedule Occurrence'
                    : 'Unable to Reschedule Appointment'}
                </AlertTitle>
                <AlertDescription className="mt-1">{serverError}</AlertDescription>
              </Alert>
            )}

            {/* Notice regarding detachment or reschedule */}
            {isRecurring ? (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-foreground">
                <p className="font-semibold">Authoritative Detach Semantics</p>
                <p className="text-[11px] mt-0.5 text-muted-foreground">
                  Rescheduling here records a MODIFIED exception on the parent series and sets{' '}
                  <code>isDetachedFromSeries = true</code>. Future series rolling generation will
                  never overwrite this appointment.
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs text-foreground">
                <p className="font-semibold">Reschedule Parameters</p>
                <p className="text-[11px] mt-0.5 text-muted-foreground">
                  Select a new date, time, therapist, or facility room. The system ensures the
                  target slot does not overlap with existing bookings or practitioner constraints.
                </p>
              </div>
            )}

            {/* Date & Time */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="edit-single-date"
                  className="text-xs font-medium text-foreground flex items-center gap-1.5"
                >
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Facility Date</span>
                </label>
                <input
                  id="edit-single-date"
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full text-xs rounded-md border border-input bg-background px-2.5 py-1.5 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="edit-single-time"
                  className="text-xs font-medium text-foreground flex items-center gap-1.5"
                >
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Local Start Time</span>
                </label>
                <input
                  id="edit-single-time"
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full text-xs rounded-md border border-input bg-background px-2.5 py-1.5 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  required
                />
              </div>
            </div>

            {/* Room & Therapist */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="edit-single-therapist"
                  className="text-xs font-medium text-foreground flex items-center gap-1.5"
                >
                  <Stethoscope className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Therapist ID</span>
                </label>
                <input
                  id="edit-single-therapist"
                  type="text"
                  value={therapistId}
                  onChange={(e) => setTherapistId(e.target.value)}
                  placeholder="e.g. therapist_sarah"
                  className="w-full text-xs rounded-md border border-input bg-background px-2.5 py-1.5 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="edit-single-room"
                  className="text-xs font-medium text-foreground flex items-center gap-1.5"
                >
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Facility Room</span>
                </label>
                <select
                  id="edit-single-room"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="w-full text-xs rounded-md border border-input bg-background px-2.5 py-1.5 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">Select Room (Optional)</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name} {room.status === 'UNAVAILABLE' ? '(Unavailable)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Mandatory Reschedule Reason */}
            <div className="space-y-1.5">
              <label htmlFor="edit-single-reason" className="text-xs font-medium text-foreground">
                Reschedule Reason (Mandatory Audit Trail){' '}
                <span className="text-destructive">*</span>
              </label>
              <textarea
                id="edit-single-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Client requested 1 hour later due to traffic conflict"
                rows={2}
                className="w-full text-xs rounded-md border border-input bg-background p-2.5 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                required
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/10">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isPending || !reason.trim()}
              className="inline-flex items-center gap-1.5"
            >
              {isRecurring
                ? editSingleMutation.isPending
                  ? 'Saving Occurrence...'
                  : 'Save & Detach'
                : rescheduleMutation.isPending
                  ? 'Rescheduling...'
                  : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
