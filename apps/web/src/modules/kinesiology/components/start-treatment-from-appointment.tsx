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
import { useTreatmentMutations } from '../hooks/use-treatment-mutations';

export interface AppointmentData {
  id: string;
  clientId: string;
  therapistId?: string;
  status: string; // e.g. 'CONFIRMED', 'SCHEDULED', 'COMPLETED', 'CANCELLED'
  startTime: string;
  endTime?: string;
  treatmentSessionId?: string;
}

interface StartTreatmentFromAppointmentProps {
  appointment: AppointmentData;
  className?: string;
}

export const StartTreatmentFromAppointment: React.FC<StartTreatmentFromAppointmentProps> = ({
  appointment,
  className,
}) => {
  const navigate = useNavigate();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [initialNotes, setInitialNotes] = useState('');

  const { createSession } = useTreatmentMutations();

  // If a session already exists for this appointment
  if (appointment.treatmentSessionId) {
    return (
      <Button
        variant="outline"
        size="sm"
        className={className}
        onClick={() => navigate(`/kinesiology/sessions/${appointment.treatmentSessionId}`)}
      >
        Open Treatment Session
      </Button>
    );
  }

  // Determine eligibility UX guidance (Backend remains authoritative)
  const isCancelled = appointment.status === 'CANCELLED' || appointment.status === 'CANCELED';
  const isCompleted = appointment.status === 'COMPLETED';
  const isEligible = !isCancelled && !isCompleted;

  const handleCreateSession = async () => {
    try {
      const session = await createSession.mutateAsync({
        appointmentId: appointment.id,
        initialNotes: initialNotes.trim().length > 0 ? initialNotes : undefined,
      });

      setIsModalOpen(false);
      navigate(`/kinesiology/sessions/${session.id}`);
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
        disabled={!isEligible || createSession.isPending}
        onClick={() => setIsModalOpen(true)}
        title={
          !isEligible
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
