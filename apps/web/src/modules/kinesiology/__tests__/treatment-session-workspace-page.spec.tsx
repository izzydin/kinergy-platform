import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { TreatmentSessionWorkspacePage } from '../routes/treatment-session-workspace-page';
import { useTreatmentSession } from '../hooks/use-treatment-session';
import { useTreatmentMutations } from '../hooks/use-treatment-mutations';

jest.mock('../hooks/use-treatment-session');
jest.mock('../hooks/use-treatment-mutations');

const mockUseTreatmentSession = useTreatmentSession as jest.Mock;
const mockUseTreatmentMutations = useTreatmentMutations as jest.Mock;

describe('TreatmentSessionWorkspacePage Unit Tests', () => {
  const startMutate = jest.fn();
  const completeMutate = jest.fn();
  const assignMutate = jest.fn();
  const updateNotesMutate = jest.fn();
  const cancelMutate = jest.fn();

  beforeEach(() => {
    mockUseTreatmentMutations.mockReturnValue({
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

  it('renders loading state when session is loading', () => {
    mockUseTreatmentSession.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    });

    render(
      <MemoryRouter initialEntries={['/kinesiology/sessions/sess_1']}>
        <Routes>
          <Route
            path="/kinesiology/sessions/:sessionId"
            element={<TreatmentSessionWorkspacePage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.queryByText(/Treatment Session Detail/i)).not.toBeInTheDocument();
  });

  it('renders SCHEDULED session with Start Session, Change Therapist, and Cancel actions', () => {
    mockUseTreatmentSession.mockReturnValue({
      data: {
        id: 'sess_1',
        clientId: 'client_100',
        appointmentId: 'appt_200',
        therapistId: 'therapist_300',
        status: 'SCHEDULED',
        notes: { subjective: 'Patient reports mild strain' },
        version: 1,
        createdAt: '2026-08-17T10:00:00.000Z',
        updatedAt: '2026-08-17T10:00:00.000Z',
      },
      isLoading: false,
      isError: false,
    });

    render(
      <MemoryRouter initialEntries={['/kinesiology/sessions/sess_1']}>
        <Routes>
          <Route
            path="/kinesiology/sessions/:sessionId"
            element={<TreatmentSessionWorkspacePage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Treatment Session Detail')).toBeInTheDocument();
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.getAllByText('client_100').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('therapist_300')).toBeInTheDocument();
    expect(screen.getByText('appt_200')).toBeInTheDocument();

    const startBtn = screen.getByRole('button', { name: /Start Session/i });
    expect(startBtn).toBeInTheDocument();
    fireEvent.click(startBtn);
    expect(startMutate).toHaveBeenCalled();

    expect(screen.getByRole('button', { name: /Change Therapist/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel Session/i })).toBeInTheDocument();
  });

  it('renders IN_PROGRESS session with Sign & Complete action and opens confirmation dialog', async () => {
    mockUseTreatmentSession.mockReturnValue({
      data: {
        id: 'sess_1',
        clientId: 'client_100',
        appointmentId: 'appt_200',
        therapistId: 'therapist_300',
        status: 'IN_PROGRESS',
        notes: { subjective: 'In treatment' },
        version: 2,
        createdAt: '2026-08-17T10:00:00.000Z',
        updatedAt: '2026-08-17T10:15:00.000Z',
      },
      isLoading: false,
      isError: false,
    });

    render(
      <MemoryRouter initialEntries={['/kinesiology/sessions/sess_1']}>
        <Routes>
          <Route
            path="/kinesiology/sessions/:sessionId"
            element={<TreatmentSessionWorkspacePage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('In Progress')).toBeInTheDocument();

    const completeBtn = screen.getByRole('button', { name: /Sign & Complete/i });
    fireEvent.click(completeBtn);

    // Confirmation dialog should appear
    await waitFor(() => {
      expect(screen.getByText('Sign & Complete Treatment Session')).toBeInTheDocument();
    });

    const confirmButtons = screen.getAllByRole('button', { name: /Sign & Complete/i });
    const dialogConfirmBtn = confirmButtons[confirmButtons.length - 1]!;
    fireEvent.click(dialogConfirmBtn);

    await waitFor(() => {
      expect(completeMutate).toHaveBeenCalled();
    });
  });

  it('renders COMPLETED session with read-only locked status', () => {
    mockUseTreatmentSession.mockReturnValue({
      data: {
        id: 'sess_1',
        clientId: 'client_100',
        appointmentId: 'appt_200',
        therapistId: 'therapist_300',
        status: 'COMPLETED',
        notes: { subjective: 'Completed encounter' },
        version: 3,
        createdAt: '2026-08-17T10:00:00.000Z',
        updatedAt: '2026-08-17T11:00:00.000Z',
      },
      isLoading: false,
      isError: false,
    });

    render(
      <MemoryRouter initialEntries={['/kinesiology/sessions/sess_1']}>
        <Routes>
          <Route
            path="/kinesiology/sessions/:sessionId"
            element={<TreatmentSessionWorkspacePage />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Completed')).toBeInTheDocument();
    expect(screen.getByText(/Locked \(Read-Only\)/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Start Session/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Sign & Complete/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Change Therapist/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cancel Session/i })).not.toBeInTheDocument();
  });
});
