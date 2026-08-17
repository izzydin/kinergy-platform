import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import {
  StartTreatmentFromAppointment,
  AppointmentData,
} from '../components/start-treatment-from-appointment';
import { useTreatmentMutations } from '../hooks/use-treatment-mutations';

jest.mock('../hooks/use-treatment-mutations');

const mockUseTreatmentMutations = useTreatmentMutations as jest.Mock;

describe('StartTreatmentFromAppointment Component Unit Tests', () => {
  const createSessionMutateAsync = jest.fn();

  beforeEach(() => {
    mockUseTreatmentMutations.mockReturnValue({
      createSession: {
        mutateAsync: createSessionMutateAsync,
        isPending: false,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const baseAppointment: AppointmentData = {
    id: 'appt_123',
    clientId: 'client_456',
    therapistId: 'therapist_789',
    status: 'CONFIRMED',
    startTime: '2026-08-17T10:00:00.000Z',
  };

  it('renders Start Treatment button for an eligible CONFIRMED appointment', () => {
    render(
      <MemoryRouter>
        <StartTreatmentFromAppointment appointment={baseAppointment} />
      </MemoryRouter>,
    );

    const button = screen.getByRole('button', { name: /Start Treatment/i });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('disables Start Treatment button for a CANCELLED appointment', () => {
    const cancelledAppt: AppointmentData = {
      ...baseAppointment,
      status: 'CANCELLED',
    };

    render(
      <MemoryRouter>
        <StartTreatmentFromAppointment appointment={cancelledAppt} />
      </MemoryRouter>,
    );

    const button = screen.getByRole('button', { name: /Start Treatment/i });
    expect(button).toBeDisabled();
  });

  it('renders "Open Treatment Session" button if session already exists', () => {
    const apptWithSession: AppointmentData = {
      ...baseAppointment,
      treatmentSessionId: 'sess_999',
    };

    render(
      <MemoryRouter>
        <StartTreatmentFromAppointment appointment={apptWithSession} />
      </MemoryRouter>,
    );

    expect(screen.getByRole('button', { name: /Open Treatment Session/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Start Treatment/i })).not.toBeInTheDocument();
  });

  it('opens modal on click, allows entering initial notes, and creates session', async () => {
    createSessionMutateAsync.mockResolvedValueOnce({
      id: 'sess_new_1',
      clientId: 'client_456',
      appointmentId: 'appt_123',
      status: 'SCHEDULED',
    });

    render(
      <MemoryRouter>
        <StartTreatmentFromAppointment appointment={baseAppointment} />
      </MemoryRouter>,
    );

    const startBtn = screen.getByRole('button', { name: /Start Treatment/i });
    fireEvent.click(startBtn);

    // Modal opens
    await waitFor(() => {
      expect(screen.getByText('Initiate Treatment Session')).toBeInTheDocument();
    });

    const notesInput = screen.getByPlaceholderText(/Chief intake complaints/i);
    fireEvent.change(notesInput, { target: { value: 'Patient reports left ankle soreness' } });

    const submitBtn = screen.getByRole('button', { name: /Create & Open Workspace/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createSessionMutateAsync).toHaveBeenCalledWith({
        appointmentId: 'appt_123',
        initialNotes: 'Patient reports left ankle soreness',
      });
    });
  });
});
