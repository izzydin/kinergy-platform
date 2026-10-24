import React, { useState } from 'react';
import { Alert, AlertDescription, AlertTitle, Button } from '@kinergy-platform/ui';
import { AlertCircle, Calendar, Clock, MapPin, Stethoscope, X } from 'lucide-react';
import type { AppointmentModel, CalendarSlotDTO, RoomModel } from '../../types/scheduling.types';
import { FACILITY_TIMEZONE, facilityDateTimeToUtcIso } from '../../utils/calendar-date.utils';
import { useEditSingleOccurrenceMutation } from '../../hooks/use-scheduling-mutations';
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

  // Initialize with appointment values
  const apptId =
    'appointmentId' in appointment && appointment.appointmentId
      ? appointment.appointmentId
      : appointment.id;

  const currentStartDate = appointment.startTime.slice(0, 10);

  // Convert facility time to 24-hr format for input (e.g. "10:00")
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

  const [newDate, setNewDate] = useState(currentStartDate);
  const [newTime, setNewTime] = useState(initialTimeInput);
  const [therapistId, setTherapistId] = useState(appointment.therapistId || '');
  const [roomId, setRoomId] = useState(appointment.roomId || '');
  const [reason, setReason] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setServerError('A reason for rescheduling this occurrence is mandatory for audit trail.');
      return;
    }

    setServerError(null);

    // Compute UTC ISO newStartTime if date/time specified
    const computedNewStart =
      newDate && newTime ? facilityDateTimeToUtcIso(newDate, newTime) : undefined;

    editSingleMutation.mutate(
      {
        appointmentId: apptId,
        payload: {
          newStartTime: computedNewStart,
          newTherapistId: therapistId.trim() || undefined,
          newRoomId: roomId.trim() || undefined,
          rescheduleReason: reason.trim(),
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
      aria-labelledby="edit-single-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-muted/20">
            <div>
              <h2 id="edit-single-title" className="text-base font-bold text-foreground">
                Reschedule Single Occurrence
              </h2>
              <p className="text-xs text-muted-foreground">
                Detaches this appointment from the series and saves modifications with conflict
                validation.
              </p>
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
            {/* Server Error Alert */}
            {serverError && (
              <Alert
                variant="destructive"
                className="border-destructive/40 bg-destructive/10 text-xs"
              >
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="font-semibold">Unable to Reschedule Occurrence</AlertTitle>
                <AlertDescription className="mt-1">{serverError}</AlertDescription>
              </Alert>
            )}

            {/* Notice regarding detachment */}
            <div className="rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 p-3 text-xs text-blue-900 dark:text-blue-300">
              <p className="font-semibold">Authoritative Detach Semantics</p>
              <p className="text-[11px] mt-0.5 text-blue-800 dark:text-blue-400">
                Rescheduling here records a MODIFIED exception on the parent series and sets{' '}
                <code>isDetachedFromSeries = true</code>. Future series rolling generation will
                never overwrite this appointment.
              </p>
            </div>

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
                  required
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
                  required
                >
                  <option value="">Select Room</option>
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
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={editSingleMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={editSingleMutation.isPending || !reason.trim()}
              className="inline-flex items-center gap-1.5"
            >
              {editSingleMutation.isPending ? 'Saving Occurrence...' : 'Save & Detach'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
