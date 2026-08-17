import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Card, CardHeader, CardContent } from '@kinergy-platform/ui';
import { useTreatmentSession } from '../hooks/use-treatment-session';
import { useTreatmentMutations } from '../hooks/use-treatment-mutations';
import { SessionStatusBadge } from '../components/session-status-badge';
import { SoapNotesForm } from '../components/soap-notes-form';
import { AssignTherapistModal } from '../components/assign-therapist-modal';
import { CancelSessionModal } from '../components/cancel-session-modal';
import { SoapNotesFormData } from '../schemas/session-notes.schema';
import { AssignTherapistFormData } from '../schemas/assign-therapist.schema';
import { CancelSessionFormData } from '../schemas/cancel-session.schema';

export const TreatmentSessionWorkspacePage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);

  const { data: session, isLoading, isError, error } = useTreatmentSession(sessionId);
  const { startSession, assignTherapist, updateNotes, completeSession, cancelSession } =
    useTreatmentMutations(sessionId);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-slate-500">Loading treatment session workspace...</p>
      </div>
    );
  }

  if (isError || !session) {
    return (
      <div className="p-6">
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold text-red-700">Unable to load session</h2>
            <p className="text-sm text-red-600 mt-1">
              {error?.message || 'The requested treatment session could not be found.'}
            </p>
            <Button variant="outline" className="mt-4" onClick={() => navigate(-1)}>
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const handleStartSession = () => {
    startSession.mutate();
  };

  const handleCompleteSession = () => {
    completeSession.mutate();
  };

  const handleSaveNotes = (data: SoapNotesFormData) => {
    updateNotes.mutate(data);
  };

  const handleAssignTherapist = (data: AssignTherapistFormData) => {
    assignTherapist.mutate(data);
  };

  const handleCancelSession = (data: CancelSessionFormData) => {
    cancelSession.mutate(data);
  };

  return (
    <div className="space-y-6 p-6 max-w-6xl mx-auto">
      {/* Top Header Card */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0 pb-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-3">
              <h1 className="text-2xl font-bold text-slate-900">Treatment Session</h1>
              <SessionStatusBadge status={session.status} />
            </div>
            <p className="text-xs text-slate-500">
              Session ID: <span className="font-mono">{session.id}</span> • Version:{' '}
              {session.version}
            </p>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            {session.status === 'SCHEDULED' && (
              <Button
                variant="default"
                onClick={handleStartSession}
                disabled={startSession.isPending}
              >
                {startSession.isPending ? 'Starting...' : 'Start Session'}
              </Button>
            )}

            {session.status === 'IN_PROGRESS' && (
              <Button
                variant="default"
                onClick={handleCompleteSession}
                disabled={completeSession.isPending}
              >
                {completeSession.isPending ? 'Signing Off...' : 'Sign & Complete'}
              </Button>
            )}

            {session.status !== 'COMPLETED' && session.status !== 'CANCELLED' && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setIsAssignModalOpen(true)}
                  disabled={assignTherapist.isPending}
                >
                  Change Therapist
                </Button>
                {session.status === 'SCHEDULED' && (
                  <Button
                    variant="destructive"
                    onClick={() => setIsCancelModalOpen(true)}
                    disabled={cancelSession.isPending}
                  >
                    Cancel Session
                  </Button>
                )}
              </>
            )}
          </div>
        </CardHeader>

        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-100 pt-4 text-sm">
          <div>
            <span className="text-slate-500 text-xs uppercase tracking-wider font-medium">
              Client ID
            </span>
            <p className="font-mono text-slate-800 text-xs mt-0.5">{session.clientId}</p>
          </div>
          <div>
            <span className="text-slate-500 text-xs uppercase tracking-wider font-medium">
              Assigned Therapist
            </span>
            <p className="font-mono text-slate-800 text-xs mt-0.5">{session.therapistId}</p>
          </div>
          <div>
            <span className="text-slate-500 text-xs uppercase tracking-wider font-medium">
              Appointment Reference
            </span>
            <p className="font-mono text-slate-800 text-xs mt-0.5">{session.appointmentId}</p>
          </div>
        </CardContent>
      </Card>

      {/* Cancellation Banner */}
      {session.status === 'CANCELLED' && session.cancellationReason && (
        <Card className="border-red-200 bg-red-50 text-red-800">
          <CardContent className="py-3 text-sm">
            <span className="font-semibold">Cancellation Reason: </span>
            {session.cancellationReason}
          </CardContent>
        </Card>
      )}

      {/* SOAP Notes Documentation Form */}
      <SoapNotesForm
        initialNotes={session.notes}
        sessionStatus={session.status}
        isLoading={updateNotes.isPending}
        onSave={handleSaveNotes}
      />

      {/* Modals */}
      <AssignTherapistModal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        onAssign={handleAssignTherapist}
        currentTherapistId={session.therapistId}
        isLoading={assignTherapist.isPending}
      />

      <CancelSessionModal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        onConfirmCancel={handleCancelSession}
        isLoading={cancelSession.isPending}
      />
    </div>
  );
};
