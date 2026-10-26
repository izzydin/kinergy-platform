import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@kinergy-platform/ui';
import { useAuth } from '../../../app/providers/auth-provider';
import { useTreatmentMutations } from '../hooks/use-treatment-mutations';
import type { TreatmentSessionModel } from '../types';

export interface AppointmentData {
  id: string;
  clientId: string;
  therapistId?: string;
  status: string; // e.g. 'CONFIRMED', 'SCHEDULED', 'COMPLETED', 'CANCELLED'
  startTime: string;
  endTime?: string;
  treatmentSessionId?: string;
}

export interface StartTreatmentFromAppointmentProps {
  appointment: AppointmentData;
  className?: string;
  canTreat?: boolean;
  canRead?: boolean;
  onSessionCreated?: (session: TreatmentSessionModel) => void;
}

export const StartTreatmentFromAppointment: React.FC<StartTreatmentFromAppointmentProps> = ({
  appointment,
  className,
  canTreat,
  canRead,
  onSessionCreated,
}) => {
  let navigate: ReturnType<typeof useNavigate> | undefined;
  try {
    navigate = useNavigate();
  } catch {
    navigate = undefined;
  }
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [initialNotes, setInitialNotes] = useState('');

  let authContext: ReturnType<typeof useAuth> | null;
  try {
    authContext = useAuth();
  } catch {
    authContext = null;
  }

  const isReadPermitted =
    canRead !== undefined
      ? canRead
      : authContext
        ? authContext.hasPermission('kinesiology.sessions.read')
        : true;

  const isTreatPermitted =
    canTreat !== undefined
      ? canTreat
      : authContext
        ? authContext.hasPermission('kinesiology.sessions.treat')
        : true;

  const { createSession } = useTreatmentMutations();

  // If a session already exists for this appointment
  if (appointment.treatmentSessionId) {
    return (
      <Button
        variant="outline"
        size="sm"
        className={className}
        disabled={!isReadPermitted}
        onClick={() => navigate?.(`/kinesiology/sessions/${appointment.treatmentSessionId}`)}
        title={
          !isReadPermitted
            ? "Requires 'kinesiology.sessions.read' permission to view session."
            : 'Open associated clinical treatment workspace'
        }
      >
        Open Treatment Session
      </Button>
    );
  }

  // Determine eligibility UX guidance (Backend remains authoritative)
  const isCancelled =
    appointment.status === 'CANCELLED' ||
    appointment.status === 'CANCELED' ||
    appointment.status === 'NO_SHOW';
  const isCompleted = appointment.status === 'COMPLETED';
  const isEligible = !isCancelled && !isCompleted;

  const handleCreateSession = async () => {
    try {
      const session = await createSession.mutateAsync({
        appointmentId: appointment.id,
        initialNotes: initialNotes.trim().length > 0 ? initialNotes : undefined,
      });

      setIsModalOpen(false);
      onSessionCreated?.(session);
      navigate?.(`/kinesiology/sessions/${session.id}`);
    } catch {
      // Error handled and notified via useNotification in useTreatmentMutations
    }
  };

  return (
    <>
      <Button
        variant="default"
        size="sm"
        className={className}
        disabled={!isEligible || !isTreatPermitted || createSession.isPending}
        onClick={() => setIsModalOpen(true)}
        title={
          !isTreatPermitted
            ? "Requires 'kinesiology.sessions.treat' permission to initiate treatment."
            : !isEligible
              ? `Cannot initiate treatment for an appointment in ${appointment.status} status.`
              : 'Start clinical kinesiology treatment session'
        }
      >
        {createSession.isPending ? 'Initiating...' : 'Start Treatment'}
      </Button>

      {/* Initiation Modal */}
      <Dialog open={isModalOpen} onOpenChange={(open) => !open && setIsModalOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Initiate Treatment Session</DialogTitle>
            <p className="text-sm text-slate-500 mt-1">
              Create a clinical encounter record linked to Appointment #{appointment.id}.
            </p>
          </DialogHeader>

          <div className="space-y-4 py-2 text-sm">
            <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-md border border-slate-100 text-xs">
              <div>
                <span className="text-slate-500">Client Reference:</span>
                <p className="font-mono font-medium text-slate-800">{appointment.clientId}</p>
              </div>
              <div>
                <span className="text-slate-500">Scheduled Time:</span>
                <p className="font-medium text-slate-800">
                  {new Date(appointment.startTime).toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="initial-notes" className="text-xs font-semibold text-slate-700">
                Initial Consultation Notes (Optional)
              </label>
              <textarea
                id="initial-notes"
                rows={3}
                value={initialNotes}
                disabled={createSession.isPending}
                onChange={(e) => setInitialNotes(e.target.value)}
                placeholder="Chief intake complaints, preliminary posture observations..."
                className="w-full rounded-md border border-slate-300 p-2 text-xs shadow-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-slate-100"
              />
            </div>
          </div>

          <DialogFooter className="flex justify-end space-x-2 pt-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              disabled={createSession.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={handleCreateSession}
              disabled={createSession.isPending}
            >
              {createSession.isPending ? 'Creating Session...' : 'Create & Open Workspace'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
