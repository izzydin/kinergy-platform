import React, { useState, useEffect } from 'react';
import { Button } from '@kinergy-platform/ui';
import {
  Calendar,
  CheckCircle2,
  Clock,
  MapPin,
  Play,
  RotateCcw,
  Stethoscope,
  User,
  UserCheck,
  X,
  XCircle,
  AlertTriangle,
  CalendarDays,
  CalendarRange,
} from 'lucide-react';
import {
  formatFacilityDate,
  formatFacilityTime,
  FACILITY_TIMEZONE,
} from '../utils/calendar-date.utils';
import { CalendarStatusBadge, ConflictBadge } from './calendar-status-badge';
import type { AppointmentModel, CalendarSlotDTO, RoomModel } from '../types/scheduling.types';
import {
  useCancelAppointmentMutation,
  useCheckInAppointmentMutation,
  useCompleteAppointmentMutation,
  useConfirmAppointmentMutation,
  useMarkNoShowMutation,
  useStartAppointmentMutation,
} from '../hooks/use-scheduling-mutations';
import {
  RecurrenceScopeDialog,
  EditSingleOccurrenceModal,
  EditFutureSeriesModal,
  SkipOccurrenceModal,
  CancelSeriesModal,
  type RecurrenceScopeAction,
} from './recurrence';

export interface AppointmentDetailDrawerProps {
  appointment: AppointmentModel | CalendarSlotDTO | null;
  isOpen: boolean;
  onClose: () => void;
  canManageAppointments?: boolean;
  rooms?: RoomModel[];
}

export const AppointmentDetailDrawer: React.FC<AppointmentDetailDrawerProps> = ({
  appointment,
  isOpen,
  onClose,
  canManageAppointments = true,
  rooms = [],
}) => {
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelPrompt, setShowCancelPrompt] = useState(false);
  const [cancelError, setCancelError] = useState('');

  // Scoped Recurrence Modals State
  const [scopeDialogAction, setScopeDialogAction] = useState<'edit' | 'cancel' | null>(null);
  const [isEditSingleModalOpen, setIsEditSingleModalOpen] = useState(false);
  const [isEditFutureModalOpen, setIsEditFutureModalOpen] = useState(false);
  const [isSkipModalOpen, setIsSkipModalOpen] = useState(false);
  const [isCancelSeriesModalOpen, setIsCancelSeriesModalOpen] = useState(false);

  const confirmMutation = useConfirmAppointmentMutation();
  const checkInMutation = useCheckInAppointmentMutation();
  const startMutation = useStartAppointmentMutation();
  const completeMutation = useCompleteAppointmentMutation();
  const cancelMutation = useCancelAppointmentMutation();
  const noShowMutation = useMarkNoShowMutation();

  // Reset form when drawer opens or appointment changes
  useEffect(() => {
    setShowCancelPrompt(false);
    setCancelReason('');
    setCancelError('');
    setScopeDialogAction(null);
    setIsEditSingleModalOpen(false);
    setIsEditFutureModalOpen(false);
    setIsSkipModalOpen(false);
    setIsCancelSeriesModalOpen(false);
  }, [appointment, isOpen]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !appointment) {
    return null;
  }

  const apptId =
    'appointmentId' in appointment && appointment.appointmentId
      ? appointment.appointmentId
      : appointment.id;

  const startTimeLabel = formatFacilityTime(appointment.startTime);
  const endTimeLabel = formatFacilityTime(appointment.endTime);
  const dateLabel = formatFacilityDate(appointment.startTime, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const clientTitle =
    'clientName' in appointment && appointment.clientName
      ? appointment.clientName
      : appointment.clientId
        ? `Client: ${appointment.clientId}`
        : 'Unspecified Client';

  const serviceLabel =
    'serviceType' in appointment && appointment.serviceType
      ? appointment.serviceType
      : 'type' in appointment && appointment.type
        ? appointment.type
        : 'Standard Appointment';

  const hasConflict = Boolean('hasConflict' in appointment && appointment.hasConflict);

  // Status transitions
  const canConfirm = appointment.status === 'SCHEDULED';
  const canCheckIn = appointment.status === 'SCHEDULED' || appointment.status === 'CONFIRMED';
  const canStart = appointment.status === 'CHECKED_IN';
  const canComplete = appointment.status === 'IN_PROGRESS';
  const canCancel =
    ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN'].includes(appointment.status) && !showCancelPrompt;
  const canMarkNoShow =
    ['SCHEDULED', 'CONFIRMED', 'CHECKED_IN'].includes(appointment.status) && !showCancelPrompt;

  const isPending =
    confirmMutation.isPending ||
    checkInMutation.isPending ||
    startMutation.isPending ||
    completeMutation.isPending ||
    cancelMutation.isPending ||
    noShowMutation.isPending;

  const handleConfirm = () => {
    confirmMutation.mutate(apptId, {
      onSuccess: () => onClose(),
    });
  };

  const handleCheckIn = () => {
    checkInMutation.mutate(apptId, {
      onSuccess: () => onClose(),
    });
  };

  const handleStart = () => {
    startMutation.mutate(apptId, {
      onSuccess: () => onClose(),
    });
  };

  const handleComplete = () => {
    completeMutation.mutate(apptId, {
      onSuccess: () => onClose(),
    });
  };

  const handleNoShow = () => {
    noShowMutation.mutate(
      { id: apptId, payload: { reason: 'Client did not attend' } },
      { onSuccess: () => onClose() },
    );
  };

  const handleExecuteCancel = () => {
    if (!cancelReason.trim()) {
      setCancelError('An operational cancellation reason is required.');
      return;
    }
    setCancelError('');
    cancelMutation.mutate(
      { id: apptId, payload: { reason: cancelReason.trim() } },
      {
        onSuccess: () => {
          setShowCancelPrompt(false);
          onClose();
        },
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-label="Appointment details and management"
    >
      {/* Click outside backdrop to close */}
      <div className="flex-1" onClick={onClose} aria-hidden="true" />

      {/* Drawer Container */}
      <div className="w-full max-w-md bg-background border-l border-border h-full shadow-2xl flex flex-col overflow-y-auto animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur-xs z-10">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span>Appointment Details</span>
              {hasConflict && <ConflictBadge size="sm" />}
            </h2>
            <div className="flex items-center gap-2">
              <CalendarStatusBadge status={appointment.status} size="sm" />
              <span className="text-xs text-muted-foreground">{FACILITY_TIMEZONE}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close appointment details"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 space-y-4 flex-1">
          {/* Conflict Alert (Only if backend marked conflict) */}
          {hasConflict && (
            <div
              className="p-3 rounded-lg border border-red-300 bg-red-50 text-red-900 dark:bg-red-950/40 dark:border-red-800 dark:text-red-200 text-xs flex items-start gap-2"
              role="alert"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
              <div>
                <p className="font-semibold">Authoritative Schedule Conflict</p>
                <p className="mt-0.5">
                  The backend scheduling system has flagged this appointment as overlapping with
                  another booking, therapist availability boundary, or room maintenance.
                </p>
              </div>
            </div>
          )}

          {/* Core Info Card */}
          <div className="rounded-lg border border-border p-3 space-y-2.5 bg-muted/20">
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Calendar className="h-4 w-4 text-primary shrink-0" />
              <span>{serviceLabel}</span>
            </div>

            <div className="grid grid-cols-1 gap-2 text-xs">
              <div className="flex items-center gap-2 text-foreground">
                <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span>
                  {dateLabel} • {startTimeLabel} – {endTimeLabel}
                </span>
              </div>

              <div className="flex items-center gap-2 text-foreground">
                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span>{clientTitle}</span>
              </div>

              {appointment.therapistId && (
                <div className="flex items-center gap-2 text-foreground">
                  <Stethoscope className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span>Therapist: {appointment.therapistId}</span>
                </div>
              )}

              {appointment.roomId && (
                <div className="flex items-center gap-2 text-foreground">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span>Room: {appointment.roomId}</span>
                </div>
              )}
            </div>
          </div>

          {/* Series Info and Scoped Recurrence Management */}
          {'seriesId' in appointment && appointment.seriesId && (
            <div className="rounded-lg border border-border p-3.5 space-y-3 bg-muted/20 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-foreground flex items-center gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5 text-primary" />
                  <span>Recurring Series Member</span>
                </span>
                {appointment.occurrenceIndex !== undefined && (
                  <span className="bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-full text-[11px]">
                    Occurrence #{appointment.occurrenceIndex + 1}
                  </span>
                )}
              </div>

              <div className="text-muted-foreground text-[11px] space-y-1">
                <p>
                  Series ID:{' '}
                  <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-[10px]">
                    {appointment.seriesId}
                  </code>
                </p>
                {appointment.isDetachedFromSeries ? (
                  <div className="mt-2 rounded-md border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/40 p-2 text-amber-900 dark:text-amber-300">
                    <p className="font-semibold text-xs">Detached from Recurring Series</p>
                    <p className="text-[11px] mt-0.5 text-amber-800 dark:text-amber-400">
                      This occurrence was previously modified with custom parameters and detached
                      from the parent recurrence aggregate. Edits here affect only this single
                      appointment.
                    </p>
                  </div>
                ) : (
                  <p className="text-[11px] text-muted-foreground">
                    Part of an active series. Changes can target this specific occurrence or fork
                    future occurrences.
                  </p>
                )}
              </div>

              {canManageAppointments && !appointment.isDetachedFromSeries && (
                <div className="pt-2 border-t border-border flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditSingleModalOpen(true)}
                    className="inline-flex items-center gap-1.5 text-xs h-7 px-2.5"
                    aria-label="Reschedule Occurrence"
                  >
                    <CalendarDays className="h-3 w-3" />
                    <span>Reschedule Occurrence</span>
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setIsEditFutureModalOpen(true)}
                    className="inline-flex items-center gap-1.5 text-xs h-7 px-2.5"
                    aria-label="Edit Future Series"
                  >
                    <CalendarRange className="h-3 w-3" />
                    <span>Edit Future Series</span>
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsSkipModalOpen(true)}
                    className="inline-flex items-center gap-1.5 text-xs h-7 px-2.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                    aria-label="Skip Slot"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    <span>Skip Slot</span>
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsCancelSeriesModalOpen(true)}
                    className="inline-flex items-center gap-1.5 text-xs h-7 px-2.5 text-destructive hover:bg-destructive/10"
                    aria-label="Cancel Series"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Cancel Series</span>
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Notes list if present */}
          {'notes' in appointment && appointment.notes && appointment.notes.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">
                Appointment Notes
              </h3>
              <div className="space-y-2">
                {appointment.notes.map((note) => (
                  <div
                    key={note.id}
                    className="p-2.5 rounded-md border border-border bg-background text-xs space-y-1"
                  >
                    <p className="text-foreground">{note.content}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {formatFacilityDate(note.createdAt)} by Author {note.authorId.slice(0, 8)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Operational Lifecycle Actions */}
          {canManageAppointments && (
            <div className="pt-2 border-t border-border space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Staff Actions
              </h3>

              {/* Status Action Buttons */}
              <div className="flex flex-wrap gap-2">
                {canConfirm && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleConfirm}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5"
                    aria-label="Confirm appointment"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Confirm</span>
                  </Button>
                )}

                {canCheckIn && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleCheckIn}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5"
                    aria-label="Check in client"
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    <span>Check In</span>
                  </Button>
                )}

                {canStart && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleStart}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white"
                    aria-label="Start treatment session"
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>Start Session</span>
                  </Button>
                )}

                {canComplete && (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleComplete}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                    aria-label="Complete appointment"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>Complete Session</span>
                  </Button>
                )}

                {/* Reschedule Button */}
                {['SCHEDULED', 'CONFIRMED'].includes(appointment.status) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (
                        'seriesId' in appointment &&
                        appointment.seriesId &&
                        !appointment.isDetachedFromSeries
                      ) {
                        setScopeDialogAction('edit');
                      } else {
                        setIsEditSingleModalOpen(true);
                      }
                    }}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5"
                    aria-label="Reschedule appointment"
                  >
                    <Clock className="h-3.5 w-3.5" />
                    <span>Reschedule...</span>
                  </Button>
                )}

                {canMarkNoShow && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleNoShow}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5 text-amber-700 hover:text-amber-800"
                    aria-label="Mark appointment as no-show"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span>Mark No-Show</span>
                  </Button>
                )}

                {canCancel && (
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      if (
                        'seriesId' in appointment &&
                        appointment.seriesId &&
                        !appointment.isDetachedFromSeries
                      ) {
                        setScopeDialogAction('cancel');
                      } else {
                        setShowCancelPrompt(true);
                      }
                    }}
                    disabled={isPending}
                    className="inline-flex items-center gap-1.5"
                    aria-label="Cancel appointment"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    <span>Cancel...</span>
                  </Button>
                )}
              </div>

              {/* Inline Cancellation Prompt (For single non-recurring appointments) */}
              {showCancelPrompt && (
                <div className="p-3 rounded-lg border border-destructive/40 bg-destructive/5 space-y-2 animate-in fade-in">
                  <p className="text-xs font-semibold text-destructive">
                    Reason for cancellation (mandatory):
                  </p>
                  <input
                    type="text"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    placeholder="e.g. Client requested cancellation via phone"
                    className="w-full text-xs rounded-md border border-input bg-background px-2.5 py-1.5 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    autoFocus
                  />
                  {cancelError && <p className="text-xs text-destructive">{cancelError}</p>}
                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={handleExecuteCancel}
                      disabled={isPending}
                    >
                      Confirm Cancellation
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setShowCancelPrompt(false)}
                      disabled={isPending}
                    >
                      Dismiss
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Recurrence Scope Selector Dialog */}
      {scopeDialogAction && (
        <RecurrenceScopeDialog
          isOpen={Boolean(scopeDialogAction)}
          onClose={() => setScopeDialogAction(null)}
          appointment={appointment}
          actionType={scopeDialogAction}
          onSelectScope={(scope: RecurrenceScopeAction) => {
            setScopeDialogAction(null);
            if (scope === 'edit-single') setIsEditSingleModalOpen(true);
            if (scope === 'edit-future') setIsEditFutureModalOpen(true);
            if (scope === 'skip-single') setIsSkipModalOpen(true);
            if (scope === 'cancel-series') setIsCancelSeriesModalOpen(true);
          }}
        />
      )}

      {/* Scoped Action Modals */}
      <EditSingleOccurrenceModal
        isOpen={isEditSingleModalOpen}
        onClose={() => setIsEditSingleModalOpen(false)}
        appointment={appointment}
        rooms={rooms}
        onSuccess={() => onClose()}
      />

      <EditFutureSeriesModal
        isOpen={isEditFutureModalOpen}
        onClose={() => setIsEditFutureModalOpen(false)}
        appointment={appointment}
        rooms={rooms}
        onSuccess={() => onClose()}
      />

      <SkipOccurrenceModal
        isOpen={isSkipModalOpen}
        onClose={() => setIsSkipModalOpen(false)}
        appointment={appointment}
        onSuccess={() => onClose()}
      />

      <CancelSeriesModal
        isOpen={isCancelSeriesModalOpen}
        onClose={() => setIsCancelSeriesModalOpen(false)}
        appointment={appointment}
        onSuccess={() => onClose()}
      />
    </div>
  );
};
