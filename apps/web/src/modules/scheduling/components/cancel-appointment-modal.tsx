import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle, Button } from '@kinergy-platform/ui';
import { AlertTriangle, Calendar, Clock, User, X } from 'lucide-react';
import type { AppointmentModel, CalendarSlotDTO } from '../types/scheduling.types';
import { formatFacilityDate, formatFacilityTime } from '../utils/calendar-date.utils';
import { useCancelAppointmentMutation } from '../hooks/use-scheduling-mutations';
import { formatSchedulingErrorMessage } from '../api/scheduling-error';

export interface CancelAppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  appointment: AppointmentModel | CalendarSlotDTO | null;
  onSuccess?: () => void;
}

export const CancelAppointmentModal: React.FC<CancelAppointmentModalProps> = ({
  isOpen,
  onClose,
  appointment,
  onSuccess,
}) => {
  const cancelMutation = useCancelAppointmentMutation();
  const [reason, setReason] = useState('');
  const [validationError, setValidationError] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  // Reset local state when modal opens or closes
  useEffect(() => {
    if (isOpen) {
      setReason('');
      setValidationError('');
      setServerError(null);
    }
  }, [isOpen]);

  // Handle Escape key inside modal with stopPropagation so drawer doesn't close
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

  if (!isOpen || !appointment) {
    return null;
  }

  const apptId =
    ('appointmentId' in appointment && appointment.appointmentId
      ? appointment.appointmentId
      : appointment.id) || '';

  const clientName =
    'client' in appointment && appointment.client?.fullName
      ? appointment.client.fullName
      : 'clientName' in appointment && appointment.clientName
        ? appointment.clientId && appointment.clientName === `Client ${appointment.clientId}`
          ? 'Client information unavailable'
          : appointment.clientName
        : 'Client information unavailable';

  const serviceLabel =
    'serviceType' in appointment && appointment.serviceType
      ? appointment.serviceType
      : 'type' in appointment && appointment.type
        ? appointment.type
        : 'Appointment';

  const dateLabel = formatFacilityDate(appointment.startTime, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timeLabel = `${formatFacilityTime(appointment.startTime)} – ${formatFacilityTime(appointment.endTime)}`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setValidationError('An operational cancellation reason is mandatory for audit trail.');
      return;
    }
    setValidationError('');
    setServerError(null);

    cancelMutation.mutate(
      {
        id: apptId,
        payload: { reason: trimmedReason },
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-appointment-title"
      data-testid="cancel-appointment-dialog"
      onClick={(e) => {
        if (e.target === e.currentTarget && !cancelMutation.isPending) {
          onClose();
        }
      }}
    >
      <div
        className="w-full max-w-md rounded-xl border border-destructive/40 bg-card shadow-2xl overflow-hidden animate-in zoom-in-95"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-5 py-4 bg-destructive/10">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-md bg-destructive/20 flex items-center justify-center text-destructive">
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              </div>
              <div>
                <h2
                  id="cancel-appointment-title"
                  className="text-base font-bold text-foreground"
                  data-testid="cancel-appointment-title"
                >
                  Cancel Appointment
                </h2>
                <p className="text-xs text-muted-foreground">
                  Confirm cancellation and release facility resources
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={cancelMutation.isPending}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-50"
              aria-label="Close cancellation dialog"
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
                role="alert"
                data-testid="cancel-server-error"
              >
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle className="font-semibold">Unable to Cancel Appointment</AlertTitle>
                <AlertDescription className="mt-1">{serverError}</AlertDescription>
              </Alert>
            )}

            {/* Appointment Context Summary */}
            <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/20 text-xs">
              <div className="flex items-center gap-2 text-foreground font-semibold">
                <span>{serviceLabel}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <User className="h-3.5 w-3.5 shrink-0" />
                <span className="font-medium text-foreground">{clientName}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-3.5 w-3.5 shrink-0" />
                <span>{dateLabel}</span>
                <span>•</span>
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span>{timeLabel}</span>
              </div>
            </div>

            {/* Informational Guidance */}
            <p className="text-xs text-muted-foreground leading-relaxed">
              Cancelling will update this appointment's status to <strong>CANCELLED</strong> and
              immediately release all reserved room and therapist slots. Historical and financial
              records are permanently preserved.
            </p>

            {/* Mandatory Reason Input */}
            <div className="space-y-1.5">
              <label
                htmlFor="cancel-appointment-reason"
                className="text-xs font-medium text-foreground"
              >
                Reason for Cancellation <span className="text-destructive">*</span>
              </label>
              <textarea
                id="cancel-appointment-reason"
                data-testid="cancel-reason-input"
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  if (validationError) setValidationError('');
                }}
                placeholder="e.g. Client called to cancel due to personal conflict"
                rows={3}
                className="w-full text-xs rounded-md border border-input bg-background p-2.5 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                disabled={cancelMutation.isPending}
                autoFocus
              />
              {validationError && (
                <p className="text-xs text-destructive" data-testid="cancel-validation-error">
                  {validationError}
                </p>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/10">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={cancelMutation.isPending}
              data-testid="cancel-dismiss-button"
            >
              Keep Appointment
            </Button>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={cancelMutation.isPending || !reason.trim()}
              className="inline-flex items-center gap-1.5"
              data-testid="cancel-confirm-button"
            >
              {cancelMutation.isPending ? 'Cancelling...' : 'Confirm Cancellation'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
