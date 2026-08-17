import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TreatmentSessionWorkspacePage } from '../routes/treatment-session-workspace-page';
import { useTreatmentSession } from '../hooks/use-treatment-session';
import { useTreatmentMutations } from '../hooks/use-treatment-mutations';
import { useAuth } from '../../../app/providers/auth-provider';

jest.mock('../hooks/use-treatment-session');
jest.mock('../hooks/use-treatment-mutations');
jest.mock('../../../app/providers/auth-provider');

const mockUseTreatmentSession = useTreatmentSession as jest.Mock;
const mockUseTreatmentMutations = useTreatmentMutations as jest.Mock;
const mockUseAuth = useAuth as jest.Mock;

describe('Kinesiology UX and Security State Handling Audit Spec', () => {
  const startMutate = jest.fn();
  const assignMutate = jest.fn();
  const updateNotesMutate = jest.fn();
  const completeMutate = jest.fn();
  const cancelMutate = jest.fn();

  beforeEach(() => {
    mockUseTreatmentMutations.mockReturnValue({
      startSession: { mutate: startMutate, isPending: false },
      assignTherapist: { mutate: assignMutate, isPending: false },
      updateNotes: { mutate: updateNotesMutate, isPending: false },
      completeSession: { mutate: completeMutate, isPending: false },
      cancelSession: { mutate: cancelMutate, isPending: false },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('hides "Start Session" and "Cancel Session" when user lacks kinesiology.sessions.treat permission', () => {
    mockUseAuth.mockReturnValue({
      hasPermission: (p: string) => p !== 'kinesiology.sessions.treat',
    });

    mockUseTreatmentSession.mockReturnValue({
      data: {
        id: 'sess_sec_1',
        clientId: 'client_1',
        appointmentId: 'appt_1',
        therapistId: 'therapist_1',
        status: 'SCHEDULED',
        notes: {},
        version: 1,
        createdAt: '2026-08-17T10:00:00.000Z',
        updatedAt: '2026-08-17T10:00:00.000Z',
      },
      isLoading: false,
      isError: false,
    });

    render(
      <MemoryRouter initialEntries={['/kinesiology/sessions/sess_sec_1']}>
        <Routes>
          <Route
            path="/kinesiology/sessions/:sessionId"
            element={<TreatmentSessionWorkspacePage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    // Read-only view for user without treat permission
    expect(screen.queryByRole('button', { name: /Start Session/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cancel Session/i })).not.toBeInTheDocument();
  });

  it('hides "Change Therapist" when user lacks kinesiology.sessions.assign permission', () => {
    mockUseAuth.mockReturnValue({
      hasPermission: (p: string) => p !== 'kinesiology.sessions.assign',
    });

    mockUseTreatmentSession.mockReturnValue({
      data: {
        id: 'sess_sec_2',
        clientId: 'client_1',
        appointmentId: 'appt_1',
        therapistId: 'therapist_1',
        status: 'SCHEDULED',
        notes: {},
        version: 1,
        createdAt: '2026-08-17T10:00:00.000Z',
        updatedAt: '2026-08-17T10:00:00.000Z',
      },
      isLoading: false,
      isError: false,
    });

    render(
      <MemoryRouter initialEntries={['/kinesiology/sessions/sess_sec_2']}>
        <Routes>
          <Route
            path="/kinesiology/sessions/:sessionId"
            element={<TreatmentSessionWorkspacePage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: /Change Therapist/i })).not.toBeInTheDocument();
  });

  it('renders StateView with error message and retry button when query fails', () => {
    mockUseAuth.mockReturnValue({
      hasPermission: () => true,
    });

    const refetch = jest.fn();
    mockUseTreatmentSession.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error('Session not found or forbidden'),
      refetch,
    });

    render(
      <MemoryRouter initialEntries={['/kinesiology/sessions/sess_err']}>
        <Routes>
          <Route
            path="/kinesiology/sessions/:sessionId"
            element={<TreatmentSessionWorkspacePage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Session not found or forbidden')).toBeInTheDocument();
    const retryBtn = screen.getByRole('button', { name: /Try Again/i });
    fireEvent.click(retryBtn);
    expect(refetch).toHaveBeenCalled();
  });
});
