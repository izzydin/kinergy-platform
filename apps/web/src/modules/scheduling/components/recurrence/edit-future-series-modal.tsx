import React, { useState } from 'react';
import { Alert, AlertDescription, AlertTitle, Button } from '@kinergy-platform/ui';
import { AlertCircle, CalendarRange, Clock, MapPin, Stethoscope, X } from 'lucide-react';
import type { AppointmentModel, CalendarSlotDTO, RoomModel } from '../../types/scheduling.types';
import { FACILITY_TIMEZONE, formatFacilityDate } from '../../utils/calendar-date.utils';
import { useEditFutureOccurrencesMutation } from '../../hooks/use-scheduling-mutations';
import { formatSchedulingErrorMessage } from '../../api/scheduling-error';

export interface EditFutureSeriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: AppointmentModel | CalendarSlotDTO;
  rooms?: RoomModel[];
  onSuccess?: () => void;
}

export const EditFutureSeriesModal: React.FC<EditFutureSeriesModalProps> = ({
  isOpen,
  onClose,
  appointment,
  rooms = [],
  onSuccess,
}) => {
  const editFutureMutation = useEditFutureOccurrencesMutation();

  const seriesId = 'seriesId' in appointment && appointment.seriesId ? appointment.seriesId : '';
  const occurrenceIndex =
    'occurrenceIndex' in appointment && appointment.occurrenceIndex !== undefined
      ? appointment.occurrenceIndex
      : 0;

  // Cutoff date is the appointment's start time in ISO
  const cutoffDateIso = appointment.startTime;
  const cutoffDateDisplay = formatFacilityDate(appointment.startTime);

  // Initial local start time
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

  const [frequency, setFrequency] = useState<'WEEKLY' | 'BIWEEKLY' | 'MONTHLY'>('WEEKLY');
  const [time, setTime] = useState(initialTimeInput);
  const [durationMinutes, setDurationMinutes] = useState(
    'durationMinutes' in appointment ? appointment.durationMinutes : 60,
  );
  const [therapistId, setTherapistId] = useState(appointment.therapistId || '');
  const [roomId, setRoomId] = useState(appointment.roomId || '');
  const [serverError, setServerError] = useState<string | null>(null);

  if (!isOpen || !seriesId) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    editFutureMutation.mutate(
      {
        seriesId,
        payload: {
          cutoffDate: cutoffDateIso,
          fromOccurrenceIndex: occurrenceIndex,
          newFrequency: frequency,
          newLocalStartTime: time,
          newDurationMinutes: durationMinutes,
          newTherapistId: therapistId.trim() || undefined,
          newRoomId: roomId.trim() || undefined,
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
      aria-labelledby="edit-future-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-muted/20">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-md bg-purple-500/10 flex items-center justify-center text-purple-600">
                <CalendarRange className="h-4 w-4" />
              </div>
              <div>
                <h2 id="edit-future-title" className="text-base font-bold text-foreground">
                  Edit Future Occurrences (Cutoff & Fork)
                </h2>
                <p className="text-xs text-muted-foreground">
                  Forks series starting from {cutoffDateDisplay} (Occurrence #{occurrenceIndex + 1})
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
                <AlertTitle className="font-semibold">
                  Unable to Update Future Occurrences
                </AlertTitle>
                <AlertDescription className="mt-1">{serverError}</AlertDescription>
              </Alert>
            )}

            {/* Explanation banner */}
            <div className="rounded-lg border border-purple-200 dark:border-purple-900 bg-purple-50/50 dark:bg-purple-950/20 p-3 text-xs text-purple-900 dark:text-purple-300">
              <p className="font-semibold">Authoritative Cutoff-and-Fork Semantics</p>
              <p className="text-[11px] mt-0.5 text-purple-800 dark:text-purple-400">
                The original recurring series terminates right before {cutoffDateDisplay}. A brand
                new series aggregate will be created starting at this occurrence with the parameters
                below, and initial appointments will be immediately materialized. Past completed
                sessions are never affected.
              </p>
            </div>

            {/* Frequency */}
            <div className="space-y-1.5">
              <label htmlFor="future-frequency" className="text-xs font-medium text-foreground">
                New Recurrence Frequency
              </label>
              <select
                id="future-frequency"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY')}
                className="w-full text-xs rounded-md border border-input bg-background px-2.5 py-1.5 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Every 2 Weeks (Bi-weekly)</option>
                <option value="MONTHLY">Monthly</option>
              </select>
            </div>

            {/* Time & Duration */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="future-time"
                  className="text-xs font-medium text-foreground flex items-center gap-1.5"
                >
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>New Local Time (EDT)</span>
                </label>
                <input
                  id="future-time"
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full text-xs rounded-md border border-input bg-background px-2.5 py-1.5 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="future-duration" className="text-xs font-medium text-foreground">
                  Duration (Minutes)
                </label>
                <input
                  id="future-duration"
                  type="number"
                  min={15}
                  max={240}
                  step={15}
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full text-xs rounded-md border border-input bg-background px-2.5 py-1.5 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  required
                />
              </div>
            </div>

            {/* Therapist & Room */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label
                  htmlFor="future-therapist"
                  className="text-xs font-medium text-foreground flex items-center gap-1.5"
                >
                  <Stethoscope className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>New Therapist ID</span>
                </label>
                <input
                  id="future-therapist"
                  type="text"
                  value={therapistId}
                  onChange={(e) => setTherapistId(e.target.value)}
                  className="w-full text-xs rounded-md border border-input bg-background px-2.5 py-1.5 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="future-room"
                  className="text-xs font-medium text-foreground flex items-center gap-1.5"
                >
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>New Facility Room</span>
                </label>
                <select
                  id="future-room"
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
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/10">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={editFutureMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={editFutureMutation.isPending}
              className="inline-flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white"
            >
              {editFutureMutation.isPending ? 'Forking Series...' : 'Fork & Update Future Series'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
