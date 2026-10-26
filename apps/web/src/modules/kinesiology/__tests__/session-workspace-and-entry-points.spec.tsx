import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppointmentDetailDrawer } from '../../scheduling/components/appointment-detail-drawer';
import { ClientTreatmentHistoryPage } from '../routes/client-treatment-history-page';
import { TreatmentSessionWorkspacePage } from '../routes/treatment-session-workspace-page';
import { useAuth } from '../../../app/providers/auth-provider';
import { useTreatmentSession } from '../hooks/use-treatment-session';
import { useTreatmentMutations } from '../hooks/use-treatment-mutations';
import { useClientTreatmentHistory } from '../hooks/use-client-treatment-history';
import type { AppointmentModel } from '../../scheduling/types/scheduling.types';
import { SessionStatus } from '@kinergy-platform/core';

// Mocks
jest.mock('../../../app/providers/auth-provider');
jest.mock('../hooks/use-treatment-session');
jest.mock('../hooks/use-treatment-mutations');
jest.mock('../hooks/use-client-treatment-history');
jest.mock('../../scheduling/hooks/use-scheduling-mutations', () => ({
  useCancelAppointmentMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useCheckInAppointmentMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useCompleteAppointmentMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useConfirmAppointmentMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useMarkNoShowMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useStartAppointmentMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useEditSingleOccurrenceMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useEditFutureOccurrencesMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useSkipOccurrenceMutation: () => ({ mutate: jest.fn(), isPending: false }),
  useCancelRecurrenceSeriesMutation: () => ({ mutate: jest.fn(), isPending: false }),
}));

const mockUseAuth = useAuth as jest.Mock;
const mockUseTreatmentSession = useTreatmentSession as jest.Mock;
const mockUseTreatmentMutations = useTreatmentMutations as jest.Mock;
const mockUseClientTreatmentHistory = useClientTreatmentHistory as jest.Mock;

describe('Milestone 5.1: Clinical Session Workspace and Entry Points Integration Tests', () => {
  let queryClient: QueryClient;

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
      currentUser: { id: 'practitioner_1', permissions: ['*'] },
    });

    mockUseTreatmentMutations.mockReturnValue({
      createSession: { mutateAsync: jest.fn(), isPending: false },
      startSession: { mutate: jest.fn(), isPending: false },
      completeSession: { mutate: jest.fn(), isPending: false },
      assignTherapist: { mutate: jest.fn(), isPending: false },
      updateNotes: { mutate: jest.fn(), isPending: false },
      cancelSession: { mutate: jest.fn(), isPending: false },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const baseAppointment: AppointmentModel = {
    id: 'appt_101',
    status: 'CONFIRMED',
    type: 'Kinesiology Standard',
    clientId: 'client_anna_202',
    therapistId: 'therapist_dr_clark',
    roomId: 'room_treatment_a',
    startTime: '2026-10-27T14:00:00.000Z',
    endTime: '2026-10-27T15:00:00.000Z',
    durationMinutes: 60,
    version: 1,
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
  };

  describe('Step 2: Appointment Entry Point (AppointmentDetailDrawer)', () => {
    it('renders "Open Treatment Session" when an appointment has a linked treatmentSessionId', () => {
      const apptWithSession: AppointmentModel = {
        ...baseAppointment,
        treatmentSessionId: 'sess_kine_501',
      };

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AppointmentDetailDrawer
              appointment={apptWithSession}
              isOpen={true}
              onClose={jest.fn()}
              canReadKinesiology={true}
              canTreatKinesiology={true}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByTestId('clinical-session-entry-point')).toBeInTheDocument();
      expect(screen.getByText('Linked')).toBeInTheDocument();
      const openBtn = screen.getByRole('button', { name: /Open Treatment Session/i });
      expect(openBtn).toBeInTheDocument();
      expect(openBtn).not.toBeDisabled();
    });

    it('renders "Start Treatment" initiation action when appointment is active and no session exists', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AppointmentDetailDrawer
              appointment={baseAppointment}
              isOpen={true}
              onClose={jest.fn()}
              canReadKinesiology={true}
              canTreatKinesiology={true}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getByTestId('clinical-session-entry-point')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Start Treatment/i })).toBeInTheDocument();
      // Verifies operational appointment button is disambiguated
      expect(screen.queryByRole('button', { name: /^Start Session$/i })).not.toBeInTheDocument();
    });

    it('prevents session creation when appointment is CANCELLED', () => {
      const cancelledAppt: AppointmentModel = {
        ...baseAppointment,
        status: 'CANCELLED',
      };

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AppointmentDetailDrawer
              appointment={cancelledAppt}
              isOpen={true}
              onClose={jest.fn()}
              canReadKinesiology={true}
              canTreatKinesiology={true}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(
        screen.getByText(
          /Cannot initiate a clinical treatment session for a cancelled or no-show appointment/i,
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Start Treatment/i })).not.toBeInTheDocument();
    });

    it('prevents session creation when appointment is COMPLETED without a linked session', () => {
      const completedAppt: AppointmentModel = {
        ...baseAppointment,
        status: 'COMPLETED',
      };

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AppointmentDetailDrawer
              appointment={completedAppt}
              isOpen={true}
              onClose={jest.fn()}
              canReadKinesiology={true}
              canTreatKinesiology={true}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(
        screen.getByText(/No clinical session was linked to this appointment prior to completion/i),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Start Treatment/i })).not.toBeInTheDocument();
    });

    it('hides clinical session entry point entirely when user lacks kinesiology permissions', () => {
      mockUseAuth.mockReturnValue({
        hasPermission: () => false,
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AppointmentDetailDrawer
              appointment={baseAppointment}
              isOpen={true}
              onClose={jest.fn()}
              canReadKinesiology={false}
              canTreatKinesiology={false}
            />
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.queryByTestId('clinical-session-entry-point')).not.toBeInTheDocument();
    });
  });

  describe('Step 3: Client Profile and Treatment History Entry Points', () => {
    it('denies access with ForbiddenView when accessing ClientTreatmentHistoryPage without permission', () => {
      mockUseAuth.mockReturnValue({
        hasPermission: (perm: string) => perm !== 'kinesiology.sessions.read',
      });

      render(
        <MemoryRouter initialEntries={['/clients/client_101/treatments']}>
          <Routes>
            <Route path="/clients/:clientId/treatments" element={<ClientTreatmentHistoryPage />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByText(/403 — Access Denied/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Missing required permission 'kinesiology.sessions.read'/i),
      ).toBeInTheDocument();
      expect(screen.queryByText('Client Profile & Clinical Records')).not.toBeInTheDocument();
    });

    it('renders client treatment history and navigates to session workspace when row action clicked', () => {
      mockUseClientTreatmentHistory.mockReturnValue({
        data: {
          items: [
            {
              sessionId: 'sess_hist_1',
              appointmentId: 'appt_hist_1',
              therapistId: 'therapist_sarah',
              status: SessionStatus.COMPLETED,
              createdAt: '2026-10-25T10:00:00.000Z',
              notesSummary: 'Treated subscapularis trigger points',
              hasFullNotes: true,
            },
          ],
          total: 1,
          page: 1,
          limit: 10,
          totalPages: 1,
        },
        isLoading: false,
        isError: false,
      });

      render(
        <MemoryRouter initialEntries={['/clients/client_101/treatments']}>
          <Routes>
            <Route path="/clients/:clientId/treatments" element={<ClientTreatmentHistoryPage />} />
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByText('Client Profile & Clinical Records')).toBeInTheDocument();
      expect(screen.getByText('therapist_sarah')).toBeInTheDocument();
      expect(screen.getByText('appt_hist_1')).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /View treatment session sess_hist_1/i }),
      ).toBeInTheDocument();
    });
  });

  describe('Step 4 & 5: Session Workspace States and Context', () => {
    it('renders 403 ForbiddenView when user lacks kinesiology.sessions.read on workspace page', () => {
      mockUseAuth.mockReturnValue({
        hasPermission: (perm: string) => perm !== 'kinesiology.sessions.read',
      });

      render(
        <MemoryRouter initialEntries={['/kinesiology/sessions/sess_guarded']}>
          <Routes>
            <Route
              path="/kinesiology/sessions/:sessionId"
              element={<TreatmentSessionWorkspacePage />}
            />
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByText(/403 — Access Denied/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Missing required permission 'kinesiology.sessions.read'/i),
      ).toBeInTheDocument();
      expect(screen.queryByText(/Treatment Session Detail/i)).not.toBeInTheDocument();
    });

    it('renders 403 ForbiddenView when backend returns HTTP 403 status', () => {
      const forbiddenError = new Error('Forbidden');
      (forbiddenError as unknown as { status: number }).status = 403;

      mockUseTreatmentSession.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: forbiddenError,
        refetch: jest.fn(),
      });

      render(
        <MemoryRouter initialEntries={['/kinesiology/sessions/sess_403']}>
          <Routes>
            <Route
              path="/kinesiology/sessions/:sessionId"
              element={<TreatmentSessionWorkspacePage />}
            />
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByText(/403 — Access Denied/i)).toBeInTheDocument();
      expect(
        screen.getByText(/You do not possess the required security permissions/i),
      ).toBeInTheDocument();
    });

    it('renders Not Found empty state when session does not exist (404)', () => {
      const notFoundError = new Error('Not found');
      (notFoundError as unknown as { status: number }).status = 404;

      mockUseTreatmentSession.mockReturnValue({
        data: undefined,
        isLoading: false,
        isError: true,
        error: notFoundError,
        refetch: jest.fn(),
      });

      render(
        <MemoryRouter initialEntries={['/kinesiology/sessions/sess_missing']}>
          <Routes>
            <Route
              path="/kinesiology/sessions/:sessionId"
              element={<TreatmentSessionWorkspacePage />}
            />
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByText(/Treatment Session Not Found/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Go Back/i })).toBeInTheDocument();
    });

    it('renders populated session workspace with authoritative client, therapist, appointment, and timing context', () => {
      mockUseTreatmentSession.mockReturnValue({
        data: {
          id: 'sess_auth_901',
          clientId: 'client_elena_77',
          appointmentId: 'appt_scheduled_88',
          therapistId: 'therapist_marcus',
          status: 'SCHEDULED',
          notes: { subjective: 'Left shoulder impingement' },
          version: 1,
          createdAt: '2026-10-26T09:00:00.000Z',
          updatedAt: '2026-10-26T09:00:00.000Z',
        },
        isLoading: false,
        isError: false,
      });

      render(
        <MemoryRouter initialEntries={['/kinesiology/sessions/sess_auth_901']}>
          <Routes>
            <Route
              path="/kinesiology/sessions/:sessionId"
              element={<TreatmentSessionWorkspacePage />}
            />
          </Routes>
        </MemoryRouter>,
      );

      // Verify Semantic Headings & Breadcrumbs
      expect(
        screen.getByRole('heading', { level: 1, name: /Treatment Session Detail/i }),
      ).toBeInTheDocument();
      expect(screen.getByRole('navigation', { name: /Breadcrumb/i })).toBeInTheDocument();

      // Verify Authoritative Domain Fields
      expect(screen.getByText('sess_auth_901')).toBeInTheDocument();
      expect(screen.getByText('Scheduled')).toBeInTheDocument();
      expect(screen.getAllByText('client_elena_77').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('therapist_marcus')).toBeInTheDocument();
      expect(screen.getByText('appt_scheduled_88')).toBeInTheDocument();
      expect(screen.getByText('Draft Notes Saved')).toBeInTheDocument();

      // Verify Permitted Actions for SCHEDULED status
      expect(screen.getByRole('button', { name: /Start Session/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Change Therapist/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cancel Session/i })).toBeInTheDocument();
    });

    it('renders COMPLETED session with locked status and post-completion navigation', () => {
      mockUseTreatmentSession.mockReturnValue({
        data: {
          id: 'sess_completed_999',
          clientId: 'client_elena_77',
          appointmentId: 'appt_scheduled_88',
          therapistId: 'therapist_marcus',
          status: 'COMPLETED',
          notes: {
            subjective: 'Pain resolved',
            objective: 'Full ROM restored',
            assessment: 'Discharge criteria met',
            plan: 'Home stretching protocol',
          },
          version: 4,
          createdAt: '2026-10-26T09:00:00.000Z',
          updatedAt: '2026-10-26T10:00:00.000Z',
        },
        isLoading: false,
        isError: false,
      });

      render(
        <MemoryRouter initialEntries={['/kinesiology/sessions/sess_completed_999']}>
          <Routes>
            <Route
              path="/kinesiology/sessions/:sessionId"
              element={<TreatmentSessionWorkspacePage />}
            />
          </Routes>
        </MemoryRouter>,
      );

      expect(screen.getByText('Completed')).toBeInTheDocument();
      expect(screen.getByText(/Finalized \(Signed & Sealed\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Treatment Encounter Finalized & Signed/i)).toBeInTheDocument();

      // Post-completion links
      expect(screen.getByRole('button', { name: /View Treatment History/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /View Client Timeline/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Client Profile/i })).toBeInTheDocument();

      // Mutative buttons are hidden
      expect(screen.queryByRole('button', { name: /Start Session/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Sign & Complete/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Change Therapist/i })).not.toBeInTheDocument();
    });
  });
});
