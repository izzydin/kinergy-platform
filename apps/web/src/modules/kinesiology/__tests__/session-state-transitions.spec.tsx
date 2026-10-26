import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TreatmentSessionWorkspacePage } from '../routes/treatment-session-workspace-page';
import { useAuth } from '../../../app/providers/auth-provider';
import { useTreatmentSession } from '../hooks/use-treatment-session';
import { useTreatmentMutations } from '../hooks/use-treatment-mutations';
import type { TreatmentSessionModel } from '../types';
import { SessionStatus } from '@kinergy-platform/core';

jest.mock('../../../app/providers/auth-provider');
jest.mock('../hooks/use-treatment-session');
jest.mock('../hooks/use-treatment-mutations');

const mockUseAuth = useAuth as jest.Mock;
const mockUseTreatmentSession = useTreatmentSession as jest.Mock;
const mockUseTreatmentMutations = useTreatmentMutations as jest.Mock;

describe('Milestone 5.3: Session State Transitions & Completed-Record Protection', () => {
  let queryClient: QueryClient;
  const startMutate = jest.fn();
  const completeMutate = jest.fn();
  const assignMutate = jest.fn();
  const updateNotesMutate = jest.fn();
  const cancelMutate = jest.fn();

  const baseSession: TreatmentSessionModel = {
    id: 'sess_transition_100',
    clientId: 'client_alpha',
    therapistId: 'therapist_beta',
    appointmentId: 'appt_gamma',
    status: SessionStatus.SCHEDULED,
    version: 1,
    notes: {
      subjective: 'Patient reports mild lumbar ache',
      objective: 'Lumbar flexion 60 degrees',
      assessment: 'L4-L5 functional restriction',
      plan: 'Myofascial release and stretching',
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
      currentUser: { id: 'therapist_beta', permissions: ['*'] },
    });

    mockUseTreatmentMutations.mockReturnValue({
      createSession: { mutateAsync: jest.fn(), isPending: false },
      startSession: { mutate: startMutate, isPending: false },
      completeSession: { mutate: completeMutate, isPending: false },
      assignTherapist: { mutate: assignMutate, isPending: false },
      updateNotes: { mutate: updateNotesMutate, isPending: false },
      cancelSession: { mutate: cancelMutate, isPending: false },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const renderWorkspace = (sessionId = 'sess_transition_100') => {
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

  describe('1. State Transition Matrix: SCHEDULED State', () => {
    beforeEach(() => {
      mockUseTreatmentSession.mockReturnValue({
        data: { ...baseSession, status: SessionStatus.SCHEDULED },
        isLoading: false,
        isError: false,
      });
    });

    it('exposes valid transitions: Start Session, Cancel Session, and Change Therapist', () => {
      renderWorkspace();

      expect(screen.getByRole('button', { name: /Start Session/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cancel Session/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Change Therapist/i })).toBeInTheDocument();

      // Sign & Complete is invalid for SCHEDULED and must be absent
      expect(screen.queryByRole('button', { name: /Sign & Complete/i })).not.toBeInTheDocument();
    });

    it('triggers startSession mutation on Start Session click', () => {
      renderWorkspace();

      const startBtn = screen.getByRole('button', { name: /Start Session/i });
      fireEvent.click(startBtn);

      expect(startMutate).toHaveBeenCalledTimes(1);
    });

    it('requires cancellation reason before submitting cancellation', async () => {
      renderWorkspace();

      const cancelBtn = screen.getByRole('button', { name: /Cancel Session/i });
      fireEvent.click(cancelBtn);

      await waitFor(() => {
        expect(screen.getByText('Cancel Treatment Session')).toBeInTheDocument();
      });

      // Submit with empty reason
      const confirmCancelBtn = screen.getByRole('button', { name: /Confirm Cancellation/i });
      fireEvent.click(confirmCancelBtn);

      await waitFor(() => {
        expect(
          screen.getByText(/Cancellation reason must be at least 3 characters/i),
        ).toBeInTheDocument();
      });
      expect(cancelMutate).not.toHaveBeenCalled();

      // Fill in valid reason
      const reasonInput = screen.getByPlaceholderText(/Provide reason/i);
      fireEvent.change(reasonInput, {
        target: { value: 'Patient emergency cancellation' },
      });
      fireEvent.click(confirmCancelBtn);

      await waitFor(() => {
        expect(cancelMutate).toHaveBeenCalledWith(
          expect.objectContaining({
            reason: 'Patient emergency cancellation',
          }),
        );
      });
    });
  });

  describe('2. State Transition Matrix: IN_PROGRESS State', () => {
    beforeEach(() => {
      mockUseTreatmentSession.mockReturnValue({
        data: { ...baseSession, status: SessionStatus.IN_PROGRESS, version: 2 },
        isLoading: false,
        isError: false,
      });
    });

    it('exposes valid transitions: Sign & Complete and Change Therapist; hides Start and Cancel', () => {
      renderWorkspace();

      expect(screen.getByRole('button', { name: /Sign & Complete/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Change Therapist/i })).toBeInTheDocument();

      // Invalid transitions from IN_PROGRESS: cannot start again or cancel directly
      expect(screen.queryByRole('button', { name: /Start Session/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Cancel Session/i })).not.toBeInTheDocument();
    });

    it('shows notes documented notice in completion modal when notes exist', async () => {
      renderWorkspace();

      const completeBtn = screen.getByRole('button', { name: /Sign & Complete/i });
      fireEvent.click(completeBtn);

      await waitFor(() => {
        expect(screen.getByText('Sign & Complete Treatment Session')).toBeInTheDocument();
      });

      expect(screen.getByTestId('notes-present-notice')).toBeInTheDocument();
      expect(screen.getByText(/Structured SOAP findings are recorded/i)).toBeInTheDocument();

      // Confirm button is enabled because notes are documented
      const confirmButtons = screen.getAllByRole('button', { name: /Sign & Complete/i });
      const dialogConfirmBtn = confirmButtons[confirmButtons.length - 1]!;
      expect(dialogConfirmBtn).not.toBeDisabled();

      fireEvent.click(dialogConfirmBtn);
      await waitFor(() => {
        expect(completeMutate).toHaveBeenCalled();
      });
    });

    it('requires explicit acknowledgment in completion modal when notes are empty', async () => {
      mockUseTreatmentSession.mockReturnValue({
        data: {
          ...baseSession,
          status: SessionStatus.IN_PROGRESS,
          notes: { subjective: '', objective: '', assessment: '', plan: '', rawText: '' },
        },
        isLoading: false,
        isError: false,
      });

      renderWorkspace();

      const completeBtn = screen.getByRole('button', { name: /Sign & Complete/i });
      fireEvent.click(completeBtn);

      await waitFor(() => {
        expect(screen.getByTestId('empty-notes-warning')).toBeInTheDocument();
      });

      const confirmButtons = screen.getAllByRole('button', { name: /Sign & Complete/i });
      const dialogConfirmBtn = confirmButtons[confirmButtons.length - 1]!;

      // Confirm button must be disabled until practitioner checks acknowledgment
      expect(dialogConfirmBtn).toBeDisabled();

      const checkbox = screen.getByTestId('confirm-empty-notes-checkbox');
      fireEvent.click(checkbox);

      expect(dialogConfirmBtn).not.toBeDisabled();
      fireEvent.click(dialogConfirmBtn);

      await waitFor(() => {
        expect(completeMutate).toHaveBeenCalled();
      });
    });
  });

  describe('3. Completed-Record Protection: COMPLETED State', () => {
    beforeEach(() => {
      mockUseTreatmentSession.mockReturnValue({
        data: {
          ...baseSession,
          status: SessionStatus.COMPLETED,
          version: 3,
        },
        isLoading: false,
        isError: false,
      });
    });

    it('locks clinical record into read-only mode and hides all mutation actions', () => {
      renderWorkspace();

      // Zero mutation actions on toolbar
      expect(screen.queryByRole('button', { name: /Start Session/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Sign & Complete/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Cancel Session/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Change Therapist/i })).not.toBeInTheDocument();

      // Locked badge is displayed
      expect(screen.getByTestId('notes-locked-badge')).toBeInTheDocument();
      expect(screen.getByText('Finalized (Signed & Sealed)')).toBeInTheDocument();

      // Post-completion navigation links exist
      expect(screen.getByRole('button', { name: /View Treatment History/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /View Client Timeline/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Client Profile/i })).toBeInTheDocument();

      // SOAP inputs must be disabled in read-only mode
      const subjectiveInput = screen.getByDisplayValue('Patient reports mild lumbar ache');
      expect(subjectiveInput).toBeDisabled();

      // Save button must not be visible
      expect(screen.queryByRole('button', { name: /Save Notes/i })).not.toBeInTheDocument();
    });
  });

  describe('4. Terminal State Protection: CANCELLED and NO_SHOW', () => {
    it('protects CANCELLED session: shows cancellation reason, locks notes, and hides mutations', () => {
      mockUseTreatmentSession.mockReturnValue({
        data: {
          ...baseSession,
          status: SessionStatus.CANCELLED,
          cancellationReason: 'Client called to reschedule due to illness',
          version: 2,
        },
        isLoading: false,
        isError: false,
      });

      renderWorkspace();

      expect(screen.getByText(/Client called to reschedule due to illness/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Start Session/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Sign & Complete/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Change Therapist/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Cancel Session/i })).not.toBeInTheDocument();
      expect(screen.getByTestId('notes-locked-badge')).toBeInTheDocument();
    });

    it('protects NO_SHOW session: locks notes and hides mutations', () => {
      mockUseTreatmentSession.mockReturnValue({
        data: {
          ...baseSession,
          status: SessionStatus.NO_SHOW,
          version: 2,
        },
        isLoading: false,
        isError: false,
      });

      renderWorkspace();

      expect(screen.queryByRole('button', { name: /Start Session/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Sign & Complete/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Change Therapist/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Cancel Session/i })).not.toBeInTheDocument();
      expect(screen.getByTestId('notes-locked-badge')).toBeInTheDocument();
    });
  });

  describe('5. Permission-Aware Action Gating', () => {
    it('hides treatment mutation actions when practitioner lacks kinesiology.sessions.treat', () => {
      mockUseAuth.mockReturnValue({
        hasPermission: (perm: string) => perm === 'kinesiology.sessions.read',
        currentUser: { id: 'auditor_1', permissions: ['kinesiology.sessions.read'] },
      });

      mockUseTreatmentSession.mockReturnValue({
        data: { ...baseSession, status: SessionStatus.SCHEDULED },
        isLoading: false,
        isError: false,
      });

      renderWorkspace();

      expect(screen.queryByRole('button', { name: /Start Session/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Cancel Session/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Change Therapist/i })).not.toBeInTheDocument();

      // Read-only indicator displayed for insufficient treatment permissions
      expect(screen.getByTestId('notes-locked-badge')).toBeInTheDocument();
    });

    it('displays ForbiddenView when caller lacks kinesiology.sessions.read', () => {
      mockUseAuth.mockReturnValue({
        hasPermission: () => false,
        currentUser: { id: 'unauthorized_user', permissions: [] },
      });

      renderWorkspace();

      expect(screen.getAllByText(/Access Denied/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByText(/Treatment Session Detail/i)).not.toBeInTheDocument();
    });
  });

  describe('6. Concurrency and Duplicate Submission Prevention', () => {
    it('disables action buttons when any mutation is pending', () => {
      mockUseTreatmentMutations.mockReturnValue({
        startSession: { mutate: startMutate, isPending: true },
        completeSession: { mutate: completeMutate, isPending: false },
        assignTherapist: { mutate: assignMutate, isPending: false },
        updateNotes: { mutate: updateNotesMutate, isPending: false },
        cancelSession: { mutate: cancelMutate, isPending: false },
      });

      mockUseTreatmentSession.mockReturnValue({
        data: { ...baseSession, status: SessionStatus.SCHEDULED },
        isLoading: false,
        isError: false,
      });

      renderWorkspace();

      const startBtn = screen.getByRole('button', { name: /Starting\.\.\./i });
      expect(startBtn).toBeDisabled();

      const changeTherapistBtn = screen.getByRole('button', { name: /Change Therapist/i });
      expect(changeTherapistBtn).toBeDisabled();

      const cancelBtn = screen.getByRole('button', { name: /Cancel Session/i });
      expect(cancelBtn).toBeDisabled();
    });
  });
});
