import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TreatmentSessionWorkspacePage } from '../routes/treatment-session-workspace-page';
import { AssignTherapistModal } from '../components/assign-therapist-modal';
import { useAuth } from '../../../app/providers/auth-provider';
import { useTreatmentSession } from '../hooks/use-treatment-session';
import { useTreatmentMutations } from '../hooks/use-treatment-mutations';
import type { TreatmentSessionModel } from '../types';
import {
  SessionStatus,
  TreatmentSession,
  SessionId,
  AssignTherapistToSessionHandler,
  AssignTherapistToSessionCommand,
  ITreatmentSessionRepository,
  ITherapistLookupPort,
  TherapistAssignedToSessionEvent,
} from '@kinergy-platform/core';
import {
  KinesiologyConcurrencyError,
  KinesiologyStateTransitionError,
} from '../api/kinesiology-error';

jest.mock('../../../app/providers/auth-provider');
jest.mock('../hooks/use-treatment-session');
jest.mock('../hooks/use-treatment-mutations');

const mockUseAuth = useAuth as jest.Mock;
const mockUseTreatmentSession = useTreatmentSession as jest.Mock;
const mockUseTreatmentMutations = useTreatmentMutations as jest.Mock;

describe('Milestone 5.4: Therapist Assignment & Handover Workflow', () => {
  let queryClient: QueryClient;
  const assignMutateAsync = jest.fn();
  const assignMutate = jest.fn();
  const refetchSession = jest.fn();

  const baseSession: TreatmentSessionModel = {
    id: 'sess_handover_101',
    clientId: 'client_alpha',
    therapistId: 'therapist_dr_smith',
    appointmentId: 'appt_beta',
    status: SessionStatus.SCHEDULED,
    version: 1,
    notes: {
      subjective: 'Initial assessment',
    },
    createdAt: '2026-08-17T09:00:00.000Z',
    updatedAt: '2026-08-17T09:00:00.000Z',
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    mockUseAuth.mockReturnValue({
      hasPermission: (perm: string) =>
        [
          'kinesiology.sessions.read',
          'kinesiology.sessions.treat',
          'kinesiology.sessions.assign',
        ].includes(perm),
      currentUser: { id: 'admin_user', permissions: ['*'] },
    });

    mockUseTreatmentSession.mockReturnValue({
      data: baseSession,
      isLoading: false,
      isError: false,
      refetch: refetchSession,
    });

    mockUseTreatmentMutations.mockReturnValue({
      createSession: { mutateAsync: jest.fn(), isPending: false },
      startSession: { mutate: jest.fn(), isPending: false },
      completeSession: { mutateAsync: jest.fn(), isPending: false },
      assignTherapist: {
        mutate: assignMutate,
        mutateAsync: assignMutateAsync,
        isPending: false,
        error: null,
      },
      updateNotes: { mutateAsync: jest.fn(), isPending: false },
      cancelSession: { mutateAsync: jest.fn(), isPending: false },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const renderWorkspace = (sessionId = 'sess_handover_101') => {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[`/kinesiology/sessions/${sessionId}`]}>
          <Routes>
            <Route
              path="/kinesiology/sessions/:sessionId"
              element={<TreatmentSessionWorkspacePage />}
            />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  };

  describe('1. Pre-Care Assignment in SCHEDULED State', () => {
    it('displays authoritative assigned therapist and exposes Change Therapist action', () => {
      renderWorkspace();

      expect(screen.getByText('therapist_dr_smith')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /change therapist/i })).toBeInTheDocument();
    });

    it('opens handover modal, displays summary, requires confirmation, and submits', async () => {
      assignMutateAsync.mockResolvedValueOnce({
        ...baseSession,
        therapistId: 'therapist_pt_clara',
        version: 2,
      });

      renderWorkspace();

      fireEvent.click(screen.getByRole('button', { name: /change therapist/i }));

      expect(
        screen.getByRole('heading', { name: /assign \/ handover therapist/i }),
      ).toBeInTheDocument();
      expect(screen.getAllByText('therapist_dr_smith')).toHaveLength(2);

      const input = screen.getByPlaceholderText(/enter practitioner uuid or id/i);
      fireEvent.change(input, { target: { value: 'therapist_pt_clara' } });

      // Check Proposed Handover Summary
      expect(screen.getByText(/proposed handover summary/i)).toBeInTheDocument();
      expect(screen.getByText(/therapist_pt_clara/i)).toBeInTheDocument();

      // Submit should be disabled before confirmation
      const submitBtn = screen.getByRole('button', { name: /confirm handover/i });
      expect(submitBtn).toBeDisabled();

      // Check confirmation checkbox
      const checkbox = screen.getByRole('checkbox', { name: /confirm the clinical handover/i });
      fireEvent.click(checkbox);
      expect(submitBtn).toBeEnabled();

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(assignMutateAsync).toHaveBeenCalledWith({
          newTherapistId: 'therapist_pt_clara',
        });
      });
    });
  });

  describe('2. Mid-Encounter Clinical Handover in IN_PROGRESS State', () => {
    beforeEach(() => {
      mockUseTreatmentSession.mockReturnValue({
        data: { ...baseSession, status: SessionStatus.IN_PROGRESS },
        isLoading: false,
        isError: false,
        refetch: refetchSession,
      });
    });

    it('displays active encounter warning banner inside handover modal', () => {
      renderWorkspace();

      fireEvent.click(screen.getByRole('button', { name: /change therapist/i }));

      expect(screen.getByText(/active encounter notice/i)).toBeInTheDocument();
      expect(
        screen.getByText(
          /reassigning will transfer active encounter charting and sign-off authority/i,
        ),
      ).toBeInTheDocument();
    });
  });

  describe('3. Terminal Record Protection (COMPLETED, CANCELLED, NO_SHOW)', () => {
    it('prohibits handover and hides Change Therapist action in COMPLETED status', () => {
      mockUseTreatmentSession.mockReturnValue({
        data: { ...baseSession, status: SessionStatus.COMPLETED },
        isLoading: false,
        isError: false,
      });

      renderWorkspace();

      expect(screen.queryByRole('button', { name: /change therapist/i })).not.toBeInTheDocument();
      expect(screen.getByText('therapist_dr_smith')).toBeInTheDocument();
      expect(screen.getByText('Finalized (Signed & Sealed)')).toBeInTheDocument();
    });

    it('prohibits handover and hides Change Therapist action in CANCELLED status', () => {
      mockUseTreatmentSession.mockReturnValue({
        data: {
          ...baseSession,
          status: SessionStatus.CANCELLED,
          cancellationReason: 'Patient cancelled encounter',
        },
        isLoading: false,
        isError: false,
      });

      renderWorkspace();

      expect(screen.queryByRole('button', { name: /change therapist/i })).not.toBeInTheDocument();
      expect(screen.getByText('therapist_dr_smith')).toBeInTheDocument();
    });

    it('prohibits handover and hides Change Therapist action in NO_SHOW status', () => {
      mockUseTreatmentSession.mockReturnValue({
        data: { ...baseSession, status: SessionStatus.NO_SHOW },
        isLoading: false,
        isError: false,
      });

      renderWorkspace();

      expect(screen.queryByRole('button', { name: /change therapist/i })).not.toBeInTheDocument();
      expect(screen.getByText('therapist_dr_smith')).toBeInTheDocument();
    });
  });

  describe('4. Permissions & Action Visibility', () => {
    it('hides Change Therapist button when user lacks kinesiology.sessions.assign', () => {
      mockUseAuth.mockReturnValue({
        hasPermission: (perm: string) =>
          ['kinesiology.sessions.read', 'kinesiology.sessions.treat'].includes(perm),
        currentUser: { id: 'therapist_staff', permissions: ['kinesiology.sessions.treat'] },
      });

      renderWorkspace();

      expect(screen.queryByRole('button', { name: /change therapist/i })).not.toBeInTheDocument();
      // Authoritative assignment remains visible for clinical accountability
      expect(screen.getByText('therapist_dr_smith')).toBeInTheDocument();
    });
  });

  describe('5. Input Validation & Eligible Practitioners Dropdown', () => {
    it('rejects selecting the currently assigned therapist with explicit validation feedback', () => {
      const handleAssign = jest.fn();

      render(
        <AssignTherapistModal
          isOpen={true}
          onClose={jest.fn()}
          onAssign={handleAssign}
          currentTherapistId="therapist_dr_smith"
          eligibleTherapists={[
            { id: 'therapist_dr_smith', name: 'Dr. Smith' },
            { id: 'therapist_clara', name: 'Clara Oswald, PT' },
          ]}
        />,
      );

      const select = screen.getByLabelText(/select replacement practitioner/i) as HTMLSelectElement;
      expect(select).toBeInTheDocument();

      // Current therapist option should be disabled
      const currentOption = screen.getByRole('option', {
        name: /dr\. smith \(currently assigned\)/i,
      }) as HTMLOptionElement;
      expect(currentOption.disabled).toBe(true);

      // Select Clara
      fireEvent.change(select, { target: { value: 'therapist_clara' } });

      // Summary displays human-readable name
      expect(screen.getAllByText(/Clara Oswald, PT/i)).toHaveLength(2);
    });

    it('rejects typing identical therapist in text mode', () => {
      const handleAssign = jest.fn();

      render(
        <AssignTherapistModal
          isOpen={true}
          onClose={jest.fn()}
          onAssign={handleAssign}
          currentTherapistId="therapist_dr_smith"
        />,
      );

      const input = screen.getByPlaceholderText(/enter practitioner uuid or id/i);
      fireEvent.change(input, { target: { value: 'therapist_dr_smith' } });

      expect(
        screen.getByText(/selected practitioner is already assigned to this session/i),
      ).toBeInTheDocument();

      const submitBtn = screen.getByRole('button', { name: /confirm handover/i });
      expect(submitBtn).toBeDisabled();
    });
  });

  describe('6. Concurrency Conflicts & Safe Error Recovery', () => {
    it('preserves form state and displays conflict resolution banner on 409 collision', () => {
      const handleAssign = jest.fn();
      const onRefresh = jest.fn();
      const conflictError = new KinesiologyConcurrencyError(
        'This treatment session was modified concurrently by another user.',
      );

      const { rerender } = render(
        <AssignTherapistModal
          isOpen={true}
          onClose={jest.fn()}
          onAssign={handleAssign}
          currentTherapistId="therapist_dr_smith"
          onRefresh={onRefresh}
        />,
      );

      const input = screen.getByPlaceholderText(
        /enter practitioner uuid or id/i,
      ) as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'therapist_pt_clara' } });
      expect(input.value).toBe('therapist_pt_clara');

      // Re-render with conflict error
      rerender(
        <AssignTherapistModal
          isOpen={true}
          onClose={jest.fn()}
          onAssign={handleAssign}
          currentTherapistId="therapist_dr_smith"
          error={conflictError}
          onRefresh={onRefresh}
        />,
      );

      expect(screen.getByTestId('assign-therapist-error-banner')).toBeInTheDocument();
      expect(screen.getByText(/reassignment conflict/i)).toBeInTheDocument();
      expect(
        screen.getByText(/this session was updated concurrently by another user/i),
      ).toBeInTheDocument();

      // Form state preserved
      expect(input.value).toBe('therapist_pt_clara');

      // User can trigger session refresh
      const refreshBtn = screen.getByRole('button', { name: /refresh latest session/i });
      fireEvent.click(refreshBtn);
      expect(onRefresh).toHaveBeenCalled();
    });

    it('displays therapist clinical ineligibility error from backend (422)', () => {
      const eligibilityError = new KinesiologyStateTransitionError(
        'Practitioner is not eligible to conduct Kinesiology treatment.',
      );

      render(
        <AssignTherapistModal
          isOpen={true}
          onClose={jest.fn()}
          onAssign={jest.fn()}
          currentTherapistId="therapist_dr_smith"
          error={eligibilityError}
        />,
      );

      expect(screen.getByTestId('assign-therapist-error-banner')).toBeInTheDocument();
      expect(
        screen.getByText(/practitioner is not eligible to conduct kinesiology treatment/i),
      ).toBeInTheDocument();
    });
  });

  describe('7. Backend Domain Aggregate & Handler Invariants', () => {
    let mockSessionRepo: jest.Mocked<ITreatmentSessionRepository>;
    let mockTherapistLookup: jest.Mocked<ITherapistLookupPort>;
    let handler: AssignTherapistToSessionHandler;

    beforeEach(() => {
      mockSessionRepo = {
        save: jest.fn().mockResolvedValue(undefined),
        findById: jest.fn(),
        findByAppointmentId: jest.fn(),
        findHistoryByClientId: jest.fn(),
      };

      mockTherapistLookup = {
        findTherapist: jest.fn(),
      };

      handler = new AssignTherapistToSessionHandler(mockSessionRepo, mockTherapistLookup);
    });

    it('successfully reassigns practitioner, advances version, and emits TherapistAssignedToSessionEvent', async () => {
      const session = TreatmentSession.create({
        id: SessionId.create('sess_domain_1'),
        clientId: 'client_x',
        therapistId: 'therapist_old',
        appointmentId: 'appt_y',
      });
      session.clearEvents();

      mockSessionRepo.findById.mockResolvedValueOnce(session);
      mockTherapistLookup.findTherapist.mockResolvedValueOnce({
        therapistId: 'therapist_new',
        status: 'ACTIVE',
        roles: ['THERAPIST'],
        isEligible: true,
      });

      const command = new AssignTherapistToSessionCommand({
        sessionId: 'sess_domain_1',
        newTherapistId: 'therapist_new',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(session.therapistId).toBe('therapist_new');
      expect(session.version).toBe(2);

      const events = session.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(TherapistAssignedToSessionEvent);

      const assignEvent = events[0] as TherapistAssignedToSessionEvent;
      expect(assignEvent.payload.previousTherapistId).toBe('therapist_old');
      expect(assignEvent.payload.newTherapistId).toBe('therapist_new');
      expect(assignEvent.version).toBe(2);
      expect(mockSessionRepo.save).toHaveBeenCalledWith(session);
    });

    it('rejects reassignment if therapist is not eligible in Identity system', async () => {
      const session = TreatmentSession.create({
        id: SessionId.create('sess_domain_2'),
        clientId: 'client_x',
        therapistId: 'therapist_old',
        appointmentId: 'appt_y',
      });

      mockSessionRepo.findById.mockResolvedValueOnce(session);
      mockTherapistLookup.findTherapist.mockResolvedValueOnce({
        therapistId: 'therapist_suspended',
        status: 'SUSPENDED',
        roles: ['THERAPIST'],
        isEligible: false,
        ineligibilityReason: 'Practitioner account is suspended.',
      });

      const command = new AssignTherapistToSessionCommand({
        sessionId: 'sess_domain_2',
        newTherapistId: 'therapist_suspended',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain('Practitioner account is suspended.');
      expect(mockSessionRepo.save).not.toHaveBeenCalled();
    });

    it('is idempotent when assigning the identical therapist', async () => {
      const session = TreatmentSession.create({
        id: SessionId.create('sess_domain_3'),
        clientId: 'client_x',
        therapistId: 'therapist_same',
        appointmentId: 'appt_y',
      });
      session.clearEvents();

      mockSessionRepo.findById.mockResolvedValueOnce(session);

      const command = new AssignTherapistToSessionCommand({
        sessionId: 'sess_domain_3',
        newTherapistId: 'therapist_same',
      });

      const result = await handler.execute(command);

      expect(result.isSuccess).toBe(true);
      expect(session.version).toBe(1);
      expect(session.getUncommittedEvents()).toHaveLength(0);
      expect(mockSessionRepo.save).not.toHaveBeenCalled();
    });

    it('prohibits reassignment on completed terminal session', async () => {
      const session = TreatmentSession.create({
        id: SessionId.create('sess_domain_4'),
        clientId: 'client_x',
        therapistId: 'therapist_old',
        appointmentId: 'appt_y',
      });
      session.start();
      session.complete();

      mockSessionRepo.findById.mockResolvedValueOnce(session);
      mockTherapistLookup.findTherapist.mockResolvedValueOnce({
        therapistId: 'therapist_new',
        status: 'ACTIVE',
        roles: ['THERAPIST'],
        isEligible: true,
      });

      const command = new AssignTherapistToSessionCommand({
        sessionId: 'sess_domain_4',
        newTherapistId: 'therapist_new',
      });

      const result = await handler.execute(command);

      expect(result.isFailure).toBe(true);
      expect(result.getError()).toContain(
        "Cannot reassign therapist for a session in 'COMPLETED' terminal status.",
      );
      expect(mockSessionRepo.save).not.toHaveBeenCalled();
    });
  });
});
