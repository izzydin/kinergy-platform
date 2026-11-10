import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CalendarPage } from '../calendar-page';
import { schedulingApi } from '../../api/scheduling-api';
import type { AppointmentModel, RoomModel } from '../../types/scheduling.types';
import { APPOINTMENT_TYPES } from '../../types/scheduling.types';
import { APPOINTMENT_TYPE_DISPLAY_CONFIGS } from '../../utils/appointment-type.utils';

// Mock schedulingApi
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
      id: 'usr_reception_test',
      permissions: ['appointments.read', 'appointments.create', 'appointments.update'],
      roles: ['staff'],
    },
    isAuthenticated: true,
    hasPermission: () => true,
    hasRole: () => true,
  }),
}));

const mockRooms: RoomModel[] = [
  {
    id: 'room-seed-kinesio-01',
    name: 'Room 1 - Kinesiology Suite',
    capacity: 1,
    status: 'AVAILABLE',
    features: ['Plinth', 'Therapy Tools'],
    maintenanceWindows: [],
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

/**
 * Fixtures covering all supported appointment types, month boundaries,
 * and UTC/local timezone boundary crossings.
 */
const comprehensiveAppointments: AppointmentModel[] = [
  {
    id: 'appt-assessment-first-day',
    status: 'CONFIRMED',
    type: 'ASSESSMENT',
    clientId: 'cli-001',
    therapistId: 'therapist-001',
    roomId: 'room-seed-kinesio-01',
    startTime: '2026-11-01T14:00:00.000Z', // Nov 1 09:00 EST
    endTime: '2026-11-01T15:00:00.000Z',
    durationMinutes: 60,
    version: 1,
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
  },
  {
    id: 'appt-treatment-mid-month',
    status: 'SCHEDULED',
    type: 'TREATMENT',
    clientId: 'cli-002',
    therapistId: 'therapist-001',
    roomId: 'room-seed-kinesio-01',
    startTime: '2026-11-10T15:00:00.000Z', // Nov 10 10:00 EST
    endTime: '2026-11-10T16:00:00.000Z',
    durationMinutes: 60,
    version: 1,
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
  },
  {
    id: 'appt-followup-mid-month',
    status: 'IN_PROGRESS',
    type: 'FOLLOW_UP',
    clientId: 'cli-003',
    therapistId: 'therapist-001',
    roomId: 'room-seed-kinesio-01',
    startTime: '2026-11-10T17:00:00.000Z', // Nov 10 12:00 EST
    endTime: '2026-11-10T17:30:00.000Z',
    durationMinutes: 30,
    version: 1,
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
  },
  {
    id: 'appt-evaluation-mid-month',
    status: 'COMPLETED',
    type: 'EVALUATION',
    clientId: 'cli-004',
    therapistId: 'therapist-001',
    roomId: 'room-seed-kinesio-01',
    startTime: '2026-11-10T19:00:00.000Z', // Nov 10 14:00 EST
    endTime: '2026-11-10T20:30:00.000Z',
    durationMinutes: 90,
    version: 1,
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
  },
  {
    id: 'appt-rental-crossing-utc',
    status: 'SCHEDULED',
    type: 'RENTAL',
    clientId: 'cli-005',
    therapistId: 'therapist-001',
    roomId: 'room-seed-kinesio-01',
    // 8:00 PM EST Nov 15 = 01:00 UTC Nov 16 (crosses UTC date boundary)
    startTime: '2026-11-16T01:00:00.000Z',
    endTime: '2026-11-16T03:00:00.000Z',
    durationMinutes: 120,
    version: 1,
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
  },
  {
    id: 'appt-groupclass-last-day',
    status: 'SCHEDULED',
    type: 'GROUP_CLASS',
    clientId: 'cli-006',
    therapistId: 'therapist-001',
    roomId: 'room-seed-kinesio-01',
    startTime: '2026-11-30T20:00:00.000Z', // Nov 30 15:00 EST
    endTime: '2026-11-30T21:00:00.000Z',
    durationMinutes: 60,
    version: 1,
    createdAt: '2026-10-20T00:00:00.000Z',
    updatedAt: '2026-10-20T00:00:00.000Z',
  },
];

const renderCalendar = (route: string) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <CalendarPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

describe('Calendar Views Cross-Type Compatibility & Timezone Behavior', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedSchedulingApi.listRooms.mockResolvedValue(mockRooms);
    mockedSchedulingApi.listAppointments.mockResolvedValue(comprehensiveAppointments);
    mockedSchedulingApi.getServiceTypes.mockResolvedValue([]);
  });

  describe('Multi-View Appointment Type Rendering', () => {
    it('loads and displays appointments across all supported appointment types in Day View', async () => {
      // 2026-11-10 has TREATMENT, FOLLOW_UP, EVALUATION
      renderCalendar('/scheduling?view=day&date=2026-11-10');

      await waitFor(() => {
        expect(screen.queryByLabelText(/Loading calendar appointments/i)).not.toBeInTheDocument();
      });

      // Verify human-readable service labels
      expect(
        screen.getByText(APPOINTMENT_TYPE_DISPLAY_CONFIGS.TREATMENT.label),
      ).toBeInTheDocument();
      expect(
        screen.getByText(APPOINTMENT_TYPE_DISPLAY_CONFIGS.FOLLOW_UP.label),
      ).toBeInTheDocument();
      expect(
        screen.getByText(APPOINTMENT_TYPE_DISPLAY_CONFIGS.EVALUATION.label),
      ).toBeInTheDocument();
    });

    it('loads and displays appointments across all supported appointment types in Week View', async () => {
      renderCalendar('/scheduling?view=week&date=2026-11-10');

      await waitFor(() => {
        expect(screen.queryByLabelText(/Loading calendar appointments/i)).not.toBeInTheDocument();
      });

      expect(
        screen.getByText(APPOINTMENT_TYPE_DISPLAY_CONFIGS.TREATMENT.label),
      ).toBeInTheDocument();
      expect(
        screen.getByText(APPOINTMENT_TYPE_DISPLAY_CONFIGS.FOLLOW_UP.label),
      ).toBeInTheDocument();
      expect(
        screen.getByText(APPOINTMENT_TYPE_DISPLAY_CONFIGS.EVALUATION.label),
      ).toBeInTheDocument();
    });

    it('loads and displays appointments across all supported appointment types in Month View', async () => {
      renderCalendar('/scheduling?view=month&date=2026-11-10');

      await waitFor(() => {
        expect(screen.queryByLabelText(/Loading calendar appointments/i)).not.toBeInTheDocument();
      });

      // All 6 types should be rendered in the month grid
      for (const type of APPOINTMENT_TYPES) {
        const label = APPOINTMENT_TYPE_DISPLAY_CONFIGS[type].label;
        expect(screen.getByText(label)).toBeInTheDocument();
      }
    });

    it('preserves appointment status badges and metadata across views without type degradation', async () => {
      renderCalendar('/scheduling?view=day&date=2026-11-10');

      await waitFor(() => {
        expect(screen.queryByLabelText(/Loading calendar appointments/i)).not.toBeInTheDocument();
      });

      expect(screen.getAllByText('Scheduled').length).toBeGreaterThan(0);
      expect(screen.getByText('In Progress')).toBeInTheDocument();
      expect(screen.getByText('Completed')).toBeInTheDocument();
    });
  });

  describe('Date, Boundary, and Timezone Invariants', () => {
    it('correctly displays appointments on the first and last days of the month in Month View', async () => {
      renderCalendar('/scheduling?view=month&date=2026-11-15');

      await waitFor(() => {
        expect(screen.queryByLabelText(/Loading calendar appointments/i)).not.toBeInTheDocument();
      });

      // First day of month (Nov 1): Initial Clinical Assessment
      expect(
        screen.getByText(APPOINTMENT_TYPE_DISPLAY_CONFIGS.ASSESSMENT.label),
      ).toBeInTheDocument();

      // Last day of month (Nov 30): Group Movement Class
      expect(
        screen.getByText(APPOINTMENT_TYPE_DISPLAY_CONFIGS.GROUP_CLASS.label),
      ).toBeInTheDocument();
    });

    it('correctly maps UTC dates to facility local dates across midnight boundaries', async () => {
      renderCalendar('/scheduling?view=month&date=2026-11-15');

      await waitFor(() => {
        expect(screen.queryByLabelText(/Loading calendar appointments/i)).not.toBeInTheDocument();
      });

      // appt-rental-crossing-utc starts at 2026-11-16T01:00:00Z which is Nov 15 20:00 in America/New_York
      // It must display the Facility / Studio Rental label in the month grid
      expect(screen.getByText(APPOINTMENT_TYPE_DISPLAY_CONFIGS.RENTAL.label)).toBeInTheDocument();
    });

    it('renders an empty state gracefully when a month has zero appointments', async () => {
      mockedSchedulingApi.listAppointments.mockResolvedValueOnce([]);

      renderCalendar('/scheduling?view=month&date=2026-08-15');

      await waitFor(() => {
        expect(screen.queryByLabelText(/Loading calendar appointments/i)).not.toBeInTheDocument();
      });

      // No error banner
      expect(screen.queryByText(/Unable to load calendar appointments/i)).not.toBeInTheDocument();
      expect(screen.getByLabelText(/Monthly appointment calendar grid/i)).toBeInTheDocument();
    });

    it('supports seamless navigation across year boundaries (Dec 2026 to Jan 2027)', async () => {
      renderCalendar('/scheduling?view=month&date=2026-12-15');

      await waitFor(() => {
        expect(screen.getByText(/December 2026/i)).toBeInTheDocument();
      });

      // Click next period
      const nextButton = screen.getByLabelText(/Next period/i);
      fireEvent.click(nextButton);

      await waitFor(() => {
        expect(screen.getByText(/January 2027/i)).toBeInTheDocument();
      });
    });
  });
});
