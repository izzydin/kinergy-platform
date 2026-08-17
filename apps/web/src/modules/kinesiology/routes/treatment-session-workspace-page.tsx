import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Button, Card, CardHeader, CardContent, StateView } from '@kinergy-platform/ui';
import { useTreatmentSession } from '../hooks/use-treatment-session';
import { useTreatmentMutations } from '../hooks/use-treatment-mutations';
import { SessionStatusBadge } from '../components/session-status-badge';
import { SoapNotesForm } from '../components/soap-notes-form';
import { AssignTherapistModal } from '../components/assign-therapist-modal';
import { CancelSessionModal } from '../components/cancel-session-modal';
import { CompleteSessionModal } from '../components/complete-session-modal';
import { SoapNotesFormData } from '../schemas/session-notes.schema';
import { AssignTherapistFormData } from '../schemas/assign-therapist.schema';
import { CancelSessionFormData } from '../schemas/cancel-session.schema';

export const TreatmentSessionWorkspacePage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);

  const { data: session, isLoading, isError, error, refetch } = useTreatmentSession(sessionId);
  const { startSession, assignTherapist, updateNotes, completeSession, cancelSession } =
    useTreatmentMutations(sessionId);

  const isAnyMutationPending =
    startSession.isPending ||
    assignTherapist.isPending ||
    updateNotes.isPending ||
    completeSession.isPending ||
    cancelSession.isPending;

  const handleStartSession = () => {
    startSession.mutate();
  };

  const handleConfirmComplete = () => {
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
      <StateView
        isLoading={isLoading}
        isEmpty={!isLoading && !isError && !session}
        emptyTitle="Treatment Session Not Found"
        emptyDescription="The requested treatment session does not exist or has been removed."
        emptyAction={
          <Button variant="outline" onClick={() => navigate(-1)}>
            Go Back
          </Button>
        }
        isError={isError}
        errorMessage={error?.message || 'Failed to load treatment session workspace.'}
        onRetry={() => refetch()}
      >
        {session && (
          <div className="space-y-6">
            {/* Top Navigation Breadcrumbs */}
            <div className="flex items-center space-x-2 text-xs text-slate-500">
              <Link to="/clients" className="hover:text-indigo-600">
                Clients
              </Link>
              <span>/</span>
              <Link
                to={`/clients/${session.clientId}/treatments`}
                className="hover:text-indigo-600 font-mono"
              >
                {session.clientId}
              </Link>
              <span>/</span>
              <span className="font-mono text-slate-700">Session {session.id}</span>
            </div>

            {/* Top Header Card */}
            <Card className="shadow-sm border-slate-200">
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between space-y-3 sm:space-y-0 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center space-x-3">
                    <h1 className="text-2xl font-bold text-slate-900">Treatment Session Detail</h1>
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
                      disabled={isAnyMutationPending}
                    >
                      {startSession.isPending ? 'Starting...' : 'Start Session'}
                    </Button>
                  )}

                  {session.status === 'IN_PROGRESS' && (
                    <Button
                      variant="default"
                      onClick={() => setIsCompleteModalOpen(true)}
                      disabled={isAnyMutationPending}
                    >
                      {completeSession.isPending ? 'Signing Off...' : 'Sign & Complete'}
                    </Button>
                  )}

                  {session.status !== 'COMPLETED' && session.status !== 'CANCELLED' && (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => setIsAssignModalOpen(true)}
                        disabled={isAnyMutationPending}
                      >
                        Change Therapist
                      </Button>
                      {session.status === 'SCHEDULED' && (
                        <Button
                          variant="destructive"
                          onClick={() => setIsCancelModalOpen(true)}
                          disabled={isAnyMutationPending}
                        >
                          Cancel Session
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </CardHeader>

              <CardContent className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 border-t border-slate-100 pt-4 text-sm">
                <div>
                  <span className="text-slate-500 text-xs uppercase tracking-wider font-medium">
                    Client Reference
                  </span>
                  <p className="mt-0.5">
                    <Link
                      to={`/clients/${session.clientId}`}
                      className="font-mono text-indigo-600 hover:underline text-xs"
                    >
                      {session.clientId}
                    </Link>
                  </p>
                </div>
                <div>
                  <span className="text-slate-500 text-xs uppercase tracking-wider font-medium">
                    Assigned Therapist
                  </span>
                  <p className="font-mono text-slate-800 text-xs mt-0.5">{session.therapistId}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-xs uppercase tracking-wider font-medium">
                    Linked Appointment
                  </span>
                  <p className="font-mono text-slate-800 text-xs mt-0.5">{session.appointmentId}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-xs uppercase tracking-wider font-medium">
                    Session Recorded At
                  </span>
                  <p className="text-slate-800 text-xs mt-0.5">
                    {new Date(session.createdAt).toLocaleDateString(undefined, {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
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

            <CompleteSessionModal
              isOpen={isCompleteModalOpen}
              onClose={() => setIsCompleteModalOpen(false)}
              onConfirm={handleConfirmComplete}
              isLoading={completeSession.isPending}
            />

            <CancelSessionModal
              isOpen={isCancelModalOpen}
              onClose={() => setIsCancelModalOpen(false)}
              onConfirmCancel={handleCancelSession}
              isLoading={cancelSession.isPending}
            />
          </div>
        )}
      </StateView>
    </div>
  );
};
