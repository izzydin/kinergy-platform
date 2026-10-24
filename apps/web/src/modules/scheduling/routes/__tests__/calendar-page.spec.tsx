import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CalendarPage } from '../calendar-page';
import { schedulingApi } from '../../api/scheduling-api';
import type { AppointmentModel, RoomModel } from '../../types/scheduling.types';

// Mock scheduling API
jest.mock('../../api/scheduling-api');
const mockedSchedulingApi = schedulingApi as jest.Mocked<typeof schedulingApi>;

// Mock notification provider
jest.mock('../../../../app/providers/notification-provider', () => ({
  useNotification: () => ({
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
  }),
}));

// Mock auth provider
jest.mock('../../../../app/providers/auth-provider', () => ({
  useAuth: () => ({
    currentUser: {
      id: 'staff_1',
      permissions: ['appointments.read', 'appointments.create', 'appointments.update'],
      roles: ['staff'],
    },
    isAuthenticated: true,
    hasPermission: (perm: string) =>
      ['appointments.read', 'appointments.create', 'appointments.update'].includes(perm),
    hasRole: () => true,
  }),
}));

const mockAppointments: AppointmentModel[] = [
  {
    id: 'appt_1',
    status: 'SCHEDULED',
    type: 'Kinesiology Consultation',
    clientId: 'client_101',
    therapistId: 'therapist_sarah',
    roomId: 'room_1',
    startTime: '2026-10-24T14:00:00.000Z', // 10:00 AM EDT
    endTime: '2026-10-24T15:00:00.000Z', // 11:00 AM EDT
    durationMinutes: 60,
    version: 1,
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
  },
  {
    id: 'appt_2',
    status: 'CONFIRMED',
    type: 'Massage Therapy',
    clientId: 'client_102',
    therapistId: 'therapist_mike',
    roomId: 'room_2',
    startTime: '2026-10-24T16:00:00.000Z', // 12:00 PM EDT
    endTime: '2026-10-24T17:00:00.000Z', // 1:00 PM EDT
    durationMinutes: 60,
    version: 1,
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
  },
];

const mockRooms: RoomModel[] = [
  {
    id: 'room_1',
    name: 'Treatment Room Alpha',
    capacity: 2,
    status: 'AVAILABLE',
    features: ['Hydraulic Bed'],
    maintenanceWindows: [],
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'room_2',
    name: 'Massage Suite Beta',
    capacity: 1,
    status: 'AVAILABLE',
    features: ['Aromatherapy'],
    maintenanceWindows: [],
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const renderCalendarPage = (initialEntries: string[] = ['/scheduling?date=2026-10-24']) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <CalendarPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('CalendarPage Route Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSchedulingApi.listAppointments.mockResolvedValue(mockAppointments);
    mockedSchedulingApi.listRooms.mockResolvedValue(mockRooms);
    mockedSchedulingApi.getServiceTypes.mockResolvedValue([]);
  });

  it('renders initial loading state then displays calendar appointments', async () => {
    renderCalendarPage();

    // Verify loading indicator is shown initially
    expect(
      screen.getByRole('status', { name: /Loading calendar appointments/i }),
    ).toBeInTheDocument();

    // Wait for appointments to render
    await waitFor(() => {
      expect(screen.getByText('Kinesiology Consultation')).toBeInTheDocument();
    });

    expect(screen.getByText('Massage Therapy')).toBeInTheDocument();
    expect(screen.getByText(/America\/New_York/i)).toBeInTheDocument();
  });

  it('renders error state and retry button on fetch failure', async () => {
    mockedSchedulingApi.listAppointments.mockRejectedValueOnce(
      new Error('Database connection failed'),
    );

    renderCalendarPage();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });

    expect(screen.getByText(/Unable to load calendar appointments/i)).toBeInTheDocument();
    expect(screen.getByText(/Database connection failed/i)).toBeInTheDocument();

    // Clicking retry refetches
    mockedSchedulingApi.listAppointments.mockResolvedValueOnce(mockAppointments);
    fireEvent.click(screen.getByRole('button', { name: /Retry/i }));

    await waitFor(() => {
      expect(screen.getByText('Kinesiology Consultation')).toBeInTheDocument();
    });
  });

  it('allows switching views between Day, Week, and Month', async () => {
    renderCalendarPage();

    await waitFor(() => {
      expect(screen.getByText('Kinesiology Consultation')).toBeInTheDocument();
    });

    // Switch to Day view
    const dayTab = screen.getByRole('tab', { name: /^Day$/i });
    fireEvent.click(dayTab);

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /Daily schedule for/i })).toBeInTheDocument();
    });

    // Switch to Month view
    const monthTab = screen.getByRole('tab', { name: /^Month$/i });
    fireEvent.click(monthTab);

    await waitFor(() => {
      expect(
        screen.getByRole('region', { name: /Monthly appointment calendar grid/i }),
      ).toBeInTheDocument();
    });
  });

  it('navigates periods forward and backward', async () => {
    renderCalendarPage(['/scheduling?view=day&date=2026-10-24']);

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/October 24, 2026/i);
    });

    // Click Next
    fireEvent.click(screen.getByRole('button', { name: /Next period/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/October 25, 2026/i);
    });

    // Click Previous
    fireEvent.click(screen.getByRole('button', { name: /Previous period/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/October 24, 2026/i);
    });
  });

  it('filters by room and clears filters', async () => {
    renderCalendarPage();

    await waitFor(() => {
      expect(screen.getByText('Kinesiology Consultation')).toBeInTheDocument();
    });

    // Change room filter
    const roomSelect = screen.getByLabelText(/Filter calendar by room/i);
    fireEvent.change(roomSelect, { target: { value: 'room_1' } });

    // "Clear Filters" button should now be visible
    const clearBtn = await screen.findByRole('button', { name: /Clear all calendar filters/i });
    expect(clearBtn).toBeInTheDocument();

    // Clicking clear resets filters
    fireEvent.click(clearBtn);

    expect(screen.queryByRole('button', { name: /Clear all calendar filters/i })).toBeNull();
  });

  it('opens appointment detail drawer on selecting an appointment', async () => {
    renderCalendarPage();

    await waitFor(() => {
      expect(screen.getByText('Kinesiology Consultation')).toBeInTheDocument();
    });

    // Click on appointment card
    const apptCard = screen.getAllByRole('button', {
      name: /Appointment: Kinesiology Consultation/i,
    })[0]!;
    fireEvent.click(apptCard);

    // Detail drawer opens
    await waitFor(() => {
      expect(
        screen.getByRole('dialog', { name: /Appointment details and management/i }),
      ).toBeInTheDocument();
    });

    expect(screen.getByText('Appointment Details')).toBeInTheDocument();

    // Close drawer
    fireEvent.click(screen.getByRole('button', { name: /Close appointment details/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('displays authoritative conflict badge when appointment has conflict', async () => {
    mockedSchedulingApi.listAppointments.mockResolvedValue([
      {
        ...mockAppointments[0]!,
        hasConflict: true,
      } as unknown as AppointmentModel,
    ]);

    renderCalendarPage();

    await waitFor(() => {
      expect(
        screen.getByRole('status', { name: /Schedule conflict detected by system/i }),
      ).toBeInTheDocument();
    });
  });

  it('opens appointment booking wizard modal on clicking Book Appointment', async () => {
    renderCalendarPage();

    await waitFor(() => {
      expect(screen.getByText('Kinesiology Consultation')).toBeInTheDocument();
    });

    const bookBtn = screen.getByRole('button', { name: /Book new appointment/i });
    fireEvent.click(bookBtn);

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Book Appointment/i })).toBeInTheDocument();
    });
    expect(screen.getByText('1. Select Client')).toBeInTheDocument();

    // Close booking dialog
    fireEvent.click(screen.getByRole('button', { name: /Close booking wizard/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Book Appointment/i })).toBeNull();
    });
  });
});
