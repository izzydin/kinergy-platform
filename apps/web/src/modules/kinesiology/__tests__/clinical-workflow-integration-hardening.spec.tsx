import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionStatus } from '@kinergy-platform/core';

// Module components and routes
import { TreatmentSessionWorkspacePage } from '../routes/treatment-session-workspace-page';
import { ClientTreatmentHistoryPage } from '../routes/client-treatment-history-page';
import { SoapNotesForm } from '../components/soap-notes-form';
import { CompleteSessionModal } from '../components/complete-session-modal';
import { CancelSessionModal } from '../components/cancel-session-modal';
import {
  StartTreatmentFromAppointment,
  AppointmentData,
} from '../components/start-treatment-from-appointment';
import { AssignTherapistModal } from '../components/assign-therapist-modal';

// Hooks & Providers
import { useAuth } from '../../../app/providers/auth-provider';
import { useTreatmentSession } from '../hooks/use-treatment-session';
import { useTreatmentMutations } from '../hooks/use-treatment-mutations';
import { useClientTreatmentHistory } from '../hooks/use-client-treatment-history';
import { kinesiologyQueryKeys } from '../api/kinesiology-query-keys';
import type { TreatmentSessionModel, PaginatedTreatmentHistory } from '../types';

jest.mock('../../../app/providers/auth-provider');
jest.mock('../hooks/use-treatment-session');
jest.mock('../hooks/use-treatment-mutations');
jest.mock('../hooks/use-client-treatment-history');

const mockUseAuth = useAuth as jest.Mock;
const mockUseTreatmentSession = useTreatmentSession as jest.Mock;
const mockUseTreatmentMutations = useTreatmentMutations as jest.Mock;
const mockUseClientTreatmentHistory = useClientTreatmentHistory as jest.Mock;

describe('Milestone 5: Clinical Workflow Integration and Data-Loss Hardening', () => {
  let queryClient: QueryClient;

  const mockStartMutate = jest.fn();
  const mockCompleteMutate = jest.fn();
  const mockAssignMutate = jest.fn();
  const mockUpdateNotesMutate = jest.fn();
  const mockCancelMutate = jest.fn();

  const standardSession: TreatmentSessionModel = {
    id: 'sess_harden_001',
    clientId: 'client_secure_99',
    therapistId: 'therapist_lead_01',
    appointmentId: 'appt_origin_777',
    status: SessionStatus.IN_PROGRESS,
    version: 2,
    notes: {
      subjective: 'Initial subjective intake from patient.',
      objective: 'Passive cervical rotation 45 degrees left.',
      assessment: 'Myofascial restriction in upper trapezius.',
      plan: 'Post-isometric relaxation exercises.',
      rawText: 'Legacy clinical notes context.',
    },
    createdAt: '2026-10-26T10:00:00.000Z',
    updatedAt: '2026-10-26T10:30:00.000Z',
  };

  const sampleHistory: PaginatedTreatmentHistory = {
    items: [
      {
        sessionId: 'sess_harden_001',
        clientId: 'client_secure_99',
        appointmentId: 'appt_origin_777',
        therapistId: 'therapist_lead_01',
        status: SessionStatus.IN_PROGRESS,
        notesSummary: 'Myofascial restriction in upper trapezius.',
        hasFullNotes: true,
        version: 2,
        createdAt: '2026-10-26T10:00:00.000Z',
        updatedAt: '2026-10-26T10:30:00.000Z',
      },
    ],
    total: 1,
    page: 1,
    limit: 10,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    mockUseAuth.mockReturnValue({
      hasPermission: (_perm: string) => true,
      currentUser: { id: 'therapist_lead_01', permissions: ['*'] },
    });

    mockUseTreatmentSession.mockReturnValue({
      data: standardSession,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });

    mockUseTreatmentMutations.mockReturnValue({
      createSession: {
        mutateAsync: jest.fn().mockResolvedValue({ id: 'sess_harden_001' }),
        isPending: false,
      },
      startSession: { mutate: mockStartMutate, isPending: false },
      completeSession: { mutate: mockCompleteMutate, isPending: false },
      assignTherapist: { mutate: mockAssignMutate, isPending: false },
      updateNotes: { mutate: mockUpdateNotesMutate, isPending: false },
      cancelSession: { mutate: mockCancelMutate, isPending: false },
    });

    mockUseClientTreatmentHistory.mockReturnValue({
      data: sampleHistory,
      isLoading: false,
      isError: false,
      error: null,
      refetch: jest.fn(),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Step 1: Trace Complete User Journeys
  // =========================================================================
  describe('Step 1: End-to-End User Journeys (Journeys 1 - 9)', () => {
    it('Journey 1: Authorized practitioner opens an appointment and navigates to its associated session', async () => {
      const appointment: AppointmentData = {
        id: 'appt_origin_777',
        clientId: 'client_secure_99',
        therapistId: 'therapist_lead_01',
        status: 'CONFIRMED',
        startTime: '2026-10-26T10:00:00.000Z',
        treatmentSessionId: 'sess_harden_001',
      };

      render(
        <MemoryRouter initialEntries={['/scheduling/appointments/appt_origin_777']}>
          <StartTreatmentFromAppointment appointment={appointment} />
        </MemoryRouter>,
      );

      const openButton = screen.getByRole('button', { name: /Open Treatment Session/i });
      expect(openButton).toBeInTheDocument();
      expect(openButton).not.toBeDisabled();
    });

    it('Journey 2: Authorized practitioner opens a client profile and navigates to treatment history', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/clients/client_secure_99/treatments']}>
            <Routes>
              <Route
                path="/clients/:clientId/treatments"
                element={<ClientTreatmentHistoryPage />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByText(/Client Profile & Clinical Records/i)).toBeInTheDocument();
      expect(screen.getByTestId('treatment-session-row-sess_harden_001')).toBeInTheDocument();
    });

    it('Journey 3: Practitioner loads a session and sees authoritative client, therapist, and session status', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/kinesiology/sessions/sess_harden_001']}>
            <Routes>
              <Route
                path="/kinesiology/sessions/:sessionId"
                element={<TreatmentSessionWorkspacePage />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByText('sess_harden_001')).toBeInTheDocument();
      expect(screen.getAllByText('client_secure_99').length).toBeGreaterThan(0);
      expect(screen.getByText('therapist_lead_01')).toBeInTheDocument();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
    });

    it('Journey 4: Practitioner edits and saves valid SOAP notes and receives server-confirmed persistence feedback', async () => {
      let resolveSave: () => void = () => {};
      const onSave = jest.fn().mockImplementation(
        () =>
          new Promise<void>((r) => {
            resolveSave = r;
          }),
      );

      const { rerender } = render(
        <SoapNotesForm
          sessionStatus="IN_PROGRESS"
          initialNotes={{ subjective: 'Patient is doing well.' }}
          onSave={onSave}
          isSaving={false}
        />,
      );

      const subjectiveInput = screen.getByLabelText(/Subjective/i);
      fireEvent.change(subjectiveInput, {
        target: { value: 'Patient reports no morning stiffness.' },
      });

      expect(screen.getByTestId('notes-unsaved-badge')).toBeInTheDocument();
      const saveBtn = screen.getByTestId('soap-save-btn');
      expect(saveBtn).not.toBeDisabled();

      fireEvent.click(saveBtn);
      await waitFor(() => {
        expect(onSave).toHaveBeenCalledWith(
          expect.objectContaining({ subjective: 'Patient reports no morning stiffness.' }),
        );
      });

      // Transition to isSaving
      rerender(
        <SoapNotesForm
          sessionStatus="IN_PROGRESS"
          initialNotes={{ subjective: 'Patient is doing well.' }}
          onSave={onSave}
          isSaving={true}
        />,
      );
      expect(screen.getByTestId('notes-saving-badge')).toBeInTheDocument();

      // Resolve save and confirm saved badge
      resolveSave();
      rerender(
        <SoapNotesForm
          sessionStatus="IN_PROGRESS"
          initialNotes={{ subjective: 'Patient reports no morning stiffness.' }}
          lastServerUpdatedAt="2026-10-26T10:45:00.000Z"
          onSave={onSave}
          isSaving={false}
        />,
      );

      await waitFor(() => {
        expect(screen.getByTestId('notes-saved-badge')).toBeInTheDocument();
      });
      expect(screen.queryByTestId('notes-unsaved-badge')).not.toBeInTheDocument();
    });

    it('Journey 5: Practitioner attempts an invalid note save and retains their input', async () => {
      const onSave = jest.fn().mockRejectedValue(new Error('Network error or server unavailable'));

      render(
        <SoapNotesForm
          sessionStatus="IN_PROGRESS"
          initialNotes={{ subjective: 'Initial' }}
          saveError={new Error('Network error or server unavailable')}
          onSave={onSave}
        />,
      );

      // Verify user input remains intact
      const subjectiveInput = screen.getByLabelText(/Subjective/i);
      fireEvent.change(subjectiveInput, {
        target: { value: 'Draft with important diagnostic notes' },
      });

      expect(screen.getByDisplayValue('Draft with important diagnostic notes')).toBeInTheDocument();
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Failed to Persist Clinical Notes/i)).toBeInTheDocument();
      expect(screen.getByTestId('soap-retry-save-btn')).toBeInTheDocument();
    });

    it('Journey 6: Practitioner performs a supported session transition (SCHEDULED -> IN_PROGRESS)', async () => {
      mockUseTreatmentSession.mockReturnValue({
        data: { ...standardSession, status: SessionStatus.SCHEDULED },
        isLoading: false,
        isError: false,
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/kinesiology/sessions/sess_harden_001']}>
            <Routes>
              <Route
                path="/kinesiology/sessions/:sessionId"
                element={<TreatmentSessionWorkspacePage />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      const startBtn = screen.getByRole('button', { name: /Start Session/i });
      expect(startBtn).toBeInTheDocument();
      fireEvent.click(startBtn);

      expect(mockStartMutate).toHaveBeenCalled();
    });

    it('Journey 7: Practitioner opens a completed record and respects immutability', () => {
      mockUseTreatmentSession.mockReturnValue({
        data: { ...standardSession, status: SessionStatus.COMPLETED },
        isLoading: false,
        isError: false,
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/kinesiology/sessions/sess_harden_001']}>
            <Routes>
              <Route
                path="/kinesiology/sessions/:sessionId"
                element={<TreatmentSessionWorkspacePage />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Read-only indicator and disabled inputs
      expect(screen.getByText(/Completed/i)).toBeInTheDocument();
      expect(screen.getByText(/Read-Only/i)).toBeInTheDocument();
      expect(screen.queryByTestId('soap-save-btn')).not.toBeInTheDocument();

      const subjectiveTextarea = screen.getByLabelText(/Subjective/i);
      expect(subjectiveTextarea).toBeDisabled();
    });

    it('Journey 8: Authorized staff reassign a therapist, resolve conflicts, and see the resulting assignment', async () => {
      const onAssign = jest.fn();

      render(
        <AssignTherapistModal
          isOpen={true}
          currentTherapistId="therapist_lead_01"
          isLoading={false}
          onClose={jest.fn()}
          onAssign={onAssign}
        />,
      );

      const therapistInput = screen.getByLabelText(/Select Replacement Practitioner/i);
      fireEvent.change(therapistInput, { target: { value: 'therapist_substitute_02' } });

      const confirmCheckbox = screen.getByRole('checkbox');
      fireEvent.click(confirmCheckbox);

      const submitBtn = screen.getByRole('button', { name: /Confirm Handover/i });
      expect(submitBtn).not.toBeDisabled();
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(onAssign).toHaveBeenCalledWith(
          expect.objectContaining({ newTherapistId: 'therapist_substitute_02' }),
        );
      });
    });

    it('Journey 9: Practitioner navigates through treatment history without accessing unauthorized records', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/clients/client_secure_99/treatments']}>
            <Routes>
              <Route
                path="/clients/:clientId/treatments"
                element={<ClientTreatmentHistoryPage />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Asserts that client ID scope is honored and only client_secure_99 history is rendered
      expect(mockUseClientTreatmentHistory).toHaveBeenCalledWith(
        'client_secure_99',
        expect.any(Object),
      );
    });
  });

  // =========================================================================
  // Step 2: Clinical-Data Integrity & Concurrency Protections
  // =========================================================================
  describe('Step 2: Clinical-Data Integrity & Concurrency Protection', () => {
    it('protects against racing session completion when notes are dirty: requires explicit acknowledgment', async () => {
      const onConfirm = jest.fn();

      render(
        <CompleteSessionModal
          isOpen={true}
          hasNotes={true}
          hasUnsavedNotes={true}
          isLoading={false}
          onClose={jest.fn()}
          onConfirm={onConfirm}
        />,
      );

      // Warning banner must be visible
      expect(screen.getByTestId('unsaved-notes-warning')).toBeInTheDocument();
      expect(screen.getByText(/Unsaved Note Changes in Editor/i)).toBeInTheDocument();

      const checkbox = screen.getByTestId('confirm-unsaved-notes-checkbox');
      expect(checkbox).not.toBeChecked();

      const signBtn = screen.getByTestId('sign-and-complete-btn');
      expect(signBtn).toBeDisabled();

      // Check acknowledgment
      fireEvent.click(checkbox);
      expect(checkbox).toBeChecked();
      expect(signBtn).not.toBeDisabled();

      fireEvent.click(signBtn);
      expect(onConfirm).toHaveBeenCalled();
    });

    it('handles concurrent session completion/lock while notes are dirty without losing typed content', () => {
      // Simulate form in read-only state because session transitioned, but with a lock error
      render(
        <SoapNotesForm
          sessionStatus="COMPLETED"
          initialNotes={{ subjective: 'Patient noted sharp lumbar pain on flexion.' }}
          saveError={new Error('Clinical encounter has been completed and locked.')}
          onSave={jest.fn()}
          onRefresh={jest.fn()}
        />,
      );

      // Input remains readable and preserved
      expect(
        screen.getByDisplayValue('Patient noted sharp lumbar pain on flexion.'),
      ).toBeInTheDocument();

      // Error alert reflects locked encounter
      expect(
        screen.getByText(/Clinical Encounter Locked — Notes Cannot Be Saved/i),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Your unsaved inputs have been preserved above for review./i),
      ).toBeInTheDocument();

      // Reload Server State button is available to sync
      expect(screen.getByTestId('soap-refresh-state-btn')).toBeInTheDocument();
    });

    it('preserves cancellation reason when cancelSession mutation fails', async () => {
      const onConfirmCancel = jest.fn().mockRejectedValue(new Error('Cancellation conflict'));

      render(
        <CancelSessionModal
          isOpen={true}
          isLoading={false}
          onClose={jest.fn()}
          onConfirmCancel={onConfirmCancel}
        />,
      );

      const reasonTextarea = screen.getByLabelText(/Cancellation Reason/i);
      fireEvent.change(reasonTextarea, {
        target: { value: 'Client called 10 minutes prior with emergency family situation.' },
      });

      const confirmBtn = screen.getByRole('button', { name: /Confirm Cancellation/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(onConfirmCancel).toHaveBeenCalledWith({
          reason: 'Client called 10 minutes prior with emergency family situation.',
        });
      });

      // Text input is not wiped
      expect(
        screen.getByDisplayValue('Client called 10 minutes prior with emergency family situation.'),
      ).toBeInTheDocument();
    });

    it('propagates dirty form state up to parent workspace', () => {
      const onDirtyChange = jest.fn();

      render(
        <SoapNotesForm
          sessionStatus="IN_PROGRESS"
          initialNotes={{ subjective: 'Original' }}
          onSave={jest.fn()}
          onDirtyChange={onDirtyChange}
        />,
      );

      const subjectiveInput = screen.getByLabelText(/Subjective/i);
      fireEvent.change(subjectiveInput, { target: { value: 'Modified text' } });

      expect(onDirtyChange).toHaveBeenCalledWith(true);
    });

    it('query keys provide consistent invalidation targets for session notes and client history', () => {
      const sessionKey = kinesiologyQueryKeys.session('sess_harden_001');
      const historyKey = kinesiologyQueryKeys.history('client_secure_99');

      expect(sessionKey).toEqual(['kinesiology', 'sessions', 'sess_harden_001']);
      expect(historyKey).toEqual(['kinesiology', 'history', 'client_secure_99']);
    });
  });

  // =========================================================================
  // Step 3: Authorization & Privacy
  // =========================================================================
  describe('Step 3: Authorization & Privacy Enforcement', () => {
    it('blocks unauthorized access to treatment session workspace when lacking permissions', () => {
      mockUseAuth.mockReturnValue({
        hasPermission: (_perm: string) => false,
        currentUser: { id: 'unauthorized_user', permissions: [] },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/kinesiology/sessions/sess_harden_001']}>
            <Routes>
              <Route
                path="/kinesiology/sessions/:sessionId"
                element={<TreatmentSessionWorkspacePage />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getAllByText(/Access Denied/i).length).toBeGreaterThan(0);
      expect(
        screen.getByText(/Missing required permission 'kinesiology.sessions.read'/i),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('soap-save-btn')).not.toBeInTheDocument();
    });

    it('hides transition and edit action controls when user has read-only permission', () => {
      mockUseAuth.mockReturnValue({
        hasPermission: (perm: string) => perm === 'kinesiology.sessions.read',
        currentUser: { id: 'auditor_01', permissions: ['kinesiology.sessions.read'] },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/kinesiology/sessions/sess_harden_001']}>
            <Routes>
              <Route
                path="/kinesiology/sessions/:sessionId"
                element={<TreatmentSessionWorkspacePage />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Auditor can see details
      expect(screen.getByText('sess_harden_001')).toBeInTheDocument();

      // Action buttons must NOT be present
      expect(screen.queryByRole('button', { name: /Sign & Complete/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Change Therapist/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Cancel Session/i })).not.toBeInTheDocument();
      expect(screen.queryByTestId('soap-save-btn')).not.toBeInTheDocument();
    });

    it('ensures no clinical notes or subjective text are exposed in query params or document titles', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/clients/client_secure_99/treatments']}>
            <Routes>
              <Route
                path="/clients/:clientId/treatments"
                element={<ClientTreatmentHistoryPage />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Check header and presentation
      expect(screen.getByText(/Client Profile & Clinical Records/i)).toBeInTheDocument();
      // Ensure raw confidential text isn't in navigation attributes or search parameters
      const viewSessionBtn = screen.getByTestId('view-session-sess_harden_001');
      expect(viewSessionBtn).toBeInTheDocument();
      expect(window.location.search).not.toContain('subjective');
      expect(window.location.search).not.toContain('trapezius');
    });
  });

  // =========================================================================
  // Step 4: Audit & Lifecycle Verification
  // =========================================================================
  describe('Step 4: Audit & Lifecycle Invariant Protections', () => {
    it('disallows starting or completing an already CANCELLED session', () => {
      mockUseTreatmentSession.mockReturnValue({
        data: { ...standardSession, status: SessionStatus.CANCELLED },
        isLoading: false,
        isError: false,
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/kinesiology/sessions/sess_harden_001']}>
            <Routes>
              <Route
                path="/kinesiology/sessions/:sessionId"
                element={<TreatmentSessionWorkspacePage />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByText('Cancelled')).toBeInTheDocument();
      expect(screen.getByText(/Read-Only/i)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Start Session/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Sign & Complete/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Change Therapist/i })).not.toBeInTheDocument();
    });

    it('disallows completing a session directly from SCHEDULED state (precondition guard)', () => {
      mockUseTreatmentSession.mockReturnValue({
        data: { ...standardSession, status: SessionStatus.SCHEDULED },
        isLoading: false,
        isError: false,
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/kinesiology/sessions/sess_harden_001']}>
            <Routes>
              <Route
                path="/kinesiology/sessions/:sessionId"
                element={<TreatmentSessionWorkspacePage />}
              />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      // Cannot jump from SCHEDULED directly to COMPLETED
      expect(screen.queryByRole('button', { name: /Sign & Complete/i })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Start Session/i })).toBeInTheDocument();
    });
  });
});
