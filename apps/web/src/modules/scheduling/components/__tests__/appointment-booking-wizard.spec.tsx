import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppointmentBookingWizard } from '../appointment-booking-wizard';
import { clientApi } from '../../../client/api/client-api';
import { schedulingApi } from '../../api/scheduling-api';
import type {
  AppointmentModel,
  RoomModel,
  ServiceTypeOptionDTO,
} from '../../types/scheduling.types';

jest.mock('../../../client/api/client-api');
jest.mock('../../api/scheduling-api');

const mockedClientApi = clientApi as jest.Mocked<typeof clientApi>;
const mockedSchedulingApi = schedulingApi as jest.Mocked<typeof schedulingApi>;

jest.mock('../../../../app/providers/notification-provider', () => ({
  useNotification: () => ({
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
  }),
}));

import type { PaginatedClientsDTO } from '../../../client/types/client.types';

const mockClients: PaginatedClientsDTO = {
  items: [
    {
      id: 'client_123',
      referenceNumber: 'CLI-001',
      firstName: 'Alice',
      lastName: 'Smith',
      fullName: 'Alice Smith',
      email: 'alice@example.com',
      phone: '+1-555-0100',
      status: 'ACTIVE',
      identityId: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      version: 1,
    },
  ],

  total: 1,
  page: 1,
  limit: 10,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

const mockServiceTypes: ServiceTypeOptionDTO[] = [
  {
    type: 'kinesiology_initial',
    label: 'Initial Kinesiology Assessment',
    standardDurationMinutes: 60,
    minDurationMinutes: 45,
    maxDurationMinutes: 90,
  },
  {
    type: 'massage_therapy',
    label: 'Registered Massage Therapy',
    standardDurationMinutes: 45,
    minDurationMinutes: 30,
    maxDurationMinutes: 60,
  },
];

const mockRooms: RoomModel[] = [
  {
    id: 'room_alpha',
    name: 'Treatment Room Alpha',
    capacity: 2,
    status: 'AVAILABLE',
    features: ['Rehab Table', 'Biofeedback'],
    maintenanceWindows: [],
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'room_beta',
    name: 'Consultation Suite Beta',
    capacity: 3,
    status: 'UNAVAILABLE',
    features: ['Desk'],
    maintenanceWindows: [],
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const mockCreatedAppointment: AppointmentModel = {
  id: 'appt_new_999',
  clientId: 'client_123',
  therapistId: 'therapist_dr_jane',
  roomId: 'room_alpha',
  type: 'Initial Kinesiology Assessment',
  startTime: '2026-10-24T14:00:00.000Z', // 10:00 AM EDT
  endTime: '2026-10-24T15:00:00.000Z', // 11:00 AM EDT
  durationMinutes: 60,
  status: 'SCHEDULED',
  version: 1,
  createdAt: '2026-10-24T09:00:00.000Z',
  updatedAt: '2026-10-24T09:00:00.000Z',
};

const renderWizard = (
  props: Partial<React.ComponentProps<typeof AppointmentBookingWizard>> = {},
) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AppointmentBookingWizard isOpen={true} initialDate="2026-10-24" {...props} />
    </QueryClientProvider>,
  );
};

describe('AppointmentBookingWizard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedClientApi.searchClients.mockResolvedValue(mockClients);
    mockedSchedulingApi.getServiceTypes.mockResolvedValue(mockServiceTypes);
    mockedSchedulingApi.listRooms.mockResolvedValue(mockRooms);
    mockedSchedulingApi.checkConflict.mockResolvedValue({ hasConflict: false, conflicts: [] });
  });

  it('guides staff through complete step-by-step booking flow and creates appointment', async () => {
    mockedSchedulingApi.createAppointment.mockResolvedValue(mockCreatedAppointment);
    const onSuccess = jest.fn();

    renderWizard({ onSuccess });

    // STEP 1: Client Selection
    expect(screen.getByText('1. Select Client')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    });

    // Select Alice Smith
    fireEvent.click(screen.getByText('Alice Smith'));
    expect(screen.getByText('Selected ✓')).toBeInTheDocument();

    // Click Next
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    // STEP 2: Service Type Selection
    await waitFor(() => {
      expect(screen.getByText('2. Choose Service Type')).toBeInTheDocument();
    });
    expect(screen.getByText('Initial Kinesiology Assessment')).toBeInTheDocument();

    // Select Service Type
    fireEvent.click(screen.getByText('Initial Kinesiology Assessment'));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    // STEP 3: Therapist Selection
    await waitFor(() => {
      expect(screen.getByText('3. Select Therapist')).toBeInTheDocument();
    });
    const therapistInput = screen.getByLabelText(/Therapist Identifier/i);
    fireEvent.change(therapistInput, { target: { value: 'therapist_dr_jane' } });
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    // STEP 4: Room Selection
    await waitFor(() => {
      expect(screen.getByText('4. Select Room')).toBeInTheDocument();
    });
    expect(screen.getByText('Treatment Room Alpha')).toBeInTheDocument();

    // Select Room Alpha
    fireEvent.click(screen.getByText('Treatment Room Alpha'));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    // STEP 5: Date & Time Selection
    await waitFor(() => {
      expect(screen.getByText('5. Date & Time')).toBeInTheDocument();
    });
    // Select 10:00 AM slot
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    // STEP 6: Review & Confirm
    await waitFor(() => {
      expect(screen.getByText('6. Review & Confirm Booking')).toBeInTheDocument();
    });
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('therapist_dr_jane')).toBeInTheDocument();
    expect(screen.getByText('Treatment Room Alpha')).toBeInTheDocument();

    // Add intake notes
    const notesInput = screen.getByLabelText(/Intake Notes/i);
    fireEvent.change(notesInput, { target: { value: 'Client reported acute lower back pain.' } });

    // Submit Booking
    const confirmBtn = screen.getByRole('button', { name: /Confirm & Book/i });
    fireEvent.click(confirmBtn);

    // Verify submission contract
    await waitFor(() => {
      expect(mockedSchedulingApi.createAppointment).toHaveBeenCalledWith({
        clientId: 'client_123',
        type: 'kinesiology_initial',
        therapistId: 'therapist_dr_jane',
        roomId: 'room_alpha',

        startTime: '2026-10-24T14:00:00.000Z', // 10:00 AM EDT
        endTime: '2026-10-24T15:00:00.000Z', // 11:00 AM EDT (60 mins)
        notes: 'Client reported acute lower back pain.',
      });
    });

    // STEP 7: Success State
    await waitFor(() => {
      expect(screen.getByText('Appointment Booked!')).toBeInTheDocument();
    });
    expect(screen.getByText('appt_new_999')).toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalledWith(mockCreatedAppointment);
  });

  it('handles 409 conflict error, displays explanation, and preserves all user inputs for retry', async () => {
    mockedSchedulingApi.createAppointment.mockRejectedValueOnce({
      statusCode: 409,
      conflicts: [
        {
          category: 'THERAPIST',
          conflictingEntityId: 'therapist_dr_jane',
          reason: 'Therapist dr_jane has an overlapping booking for the requested interval.',
        },
      ],
    });

    renderWizard();

    // Navigate through to review
    await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Alice Smith'));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    await waitFor(() =>
      expect(screen.getByText('Initial Kinesiology Assessment')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText('Initial Kinesiology Assessment'));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    await waitFor(() => expect(screen.getByLabelText(/Therapist Identifier/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Therapist Identifier/i), {
      target: { value: 'therapist_dr_jane' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    await waitFor(() => expect(screen.getByText('Treatment Room Alpha')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Treatment Room Alpha'));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    await waitFor(() => expect(screen.getByText('5. Date & Time')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: '10:00' }));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Confirm & Book/i })).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Book/i }));

    // Expect conflict error alert displayed
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
    expect(screen.getByText(/Therapist dr_jane has an overlapping booking/i)).toBeInTheDocument();
    expect(screen.getByText(/Your form data has been preserved/i)).toBeInTheDocument();

    // Verify inputs remain preserved: Alice Smith, dr_jane, Room Alpha
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('therapist_dr_jane')).toBeInTheDocument();
    expect(screen.getByText('Treatment Room Alpha')).toBeInTheDocument();

    // Staff can step back to change time slot and retry without losing client or therapist!
    fireEvent.click(screen.getByRole('button', { name: /Previous/i }));
    await waitFor(() => {
      expect(screen.getByText('5. Date & Time')).toBeInTheDocument();
    });

    // Select 14:00 instead
    fireEvent.click(screen.getByRole('button', { name: '14:00' }));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    // Successful retry
    mockedSchedulingApi.createAppointment.mockResolvedValueOnce(mockCreatedAppointment);
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Book/i }));

    await waitFor(() => {
      expect(screen.getByText('Appointment Booked!')).toBeInTheDocument();
    });
  });

  it('displays advisory conflict pre-check warning when checkConflict detects overlap', async () => {
    mockedSchedulingApi.checkConflict.mockResolvedValue({
      hasConflict: true,
      conflicts: [
        {
          category: 'ROOM',
          conflictingEntityId: 'room_alpha',
          reason: 'Room Alpha is reserved for routine equipment maintenance.',
        },
      ],
    });

    renderWizard();

    // Select Alice Smith
    await waitFor(() => expect(screen.getByText('Alice Smith')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Alice Smith'));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    // Select Service
    await waitFor(() =>
      expect(screen.getByText('Initial Kinesiology Assessment')).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByText('Initial Kinesiology Assessment'));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    // Enter therapist
    await waitFor(() => expect(screen.getByLabelText(/Therapist Identifier/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Therapist Identifier/i), {
      target: { value: 'therapist_dr_jane' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    // Select Room
    await waitFor(() => expect(screen.getByText('Treatment Room Alpha')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Treatment Room Alpha'));
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    // Step 5: Date & Time - Conflict pre-check triggers
    await waitFor(() => {
      expect(screen.getByText('Conflict Pre-Check Warning')).toBeInTheDocument();
    });
    expect(
      screen.getByText(/Room Alpha is reserved for routine equipment maintenance/i),
    ).toBeInTheDocument();
  });
});
