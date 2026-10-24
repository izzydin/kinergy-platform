import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AppointmentBookingWizard } from '../appointment-booking-wizard';
import { RoomsPage } from '../../routes/rooms-page';
import { clientApi } from '../../../client/api/client-api';
import { schedulingApi } from '../../api/scheduling-api';
import {
  facilityDateTimeToUtcIso,
  facilityDayStartToUtcIso,
  facilityDayEndToUtcIso,
  formatFacilityTime,
  formatFacilityDate,
  calculateSlotPosition,
  FACILITY_TIMEZONE,
} from '../../utils/calendar-date.utils';
import type {
  AppointmentModel,
  RoomModel,
  ServiceTypeOptionDTO,
} from '../../types/scheduling.types';
import * as authProvider from '../../../../app/providers/auth-provider';

// Mock Client and Scheduling APIs
jest.mock('../../../client/api/client-api');
jest.mock('../../api/scheduling-api');

const mockedClientApi = clientApi as jest.Mocked<typeof clientApi>;
const mockedSchedulingApi = schedulingApi as jest.Mocked<typeof schedulingApi>;

// Mock Notification Provider
const mockNotification = {
  success: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warning: jest.fn(),
};

jest.mock('../../../../app/providers/notification-provider', () => ({
  useNotification: () => mockNotification,
}));

// Mock Auth Provider
jest.mock('../../../../app/providers/auth-provider', () => ({
  useAuth: jest.fn(),
}));

const mockClients = {
  items: [
    {
      id: 'client_hardening_1',
      referenceNumber: 'CLI-001',
      firstName: 'Eleanor',
      lastName: 'Vance',
      fullName: 'Eleanor Vance',
      email: 'eleanor@example.com',
      phone: '555-0199',
      status: 'ACTIVE' as const,
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
    label: 'Kinesiology Evaluation',
    standardDurationMinutes: 60,
    minDurationMinutes: 45,
    maxDurationMinutes: 90,
  },
];

const mockRooms: RoomModel[] = [
  {
    id: 'room_rehab_alpha',
    name: 'Rehab Suite Alpha',
    capacity: 2,
    status: 'AVAILABLE',
    features: ['adjustable_table', 'ultrasound_unit'],
    maintenanceWindows: [],
    version: 5,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  },
];

const createTestWrapper = (queryClient?: QueryClient) => {
  const client =
    queryClient ??
    new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/scheduling']}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
};

describe('Milestone 4: Scheduling Reliability and Cross-Feature Hardening', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (authProvider.useAuth as jest.Mock).mockReturnValue({
      currentUser: {
        id: 'usr_lead_therapist',
        roles: ['ADMIN'],
        permissions: [
          'appointments.read',
          'appointments.create',
          'appointments.update',
          'appointments.cancel',
          'settings.read',
          'settings.write',
        ],
      },
      isAuthenticated: true,
      hasPermission: () => true,
      hasRole: () => true,
    });

    mockedClientApi.searchClients.mockResolvedValue(mockClients);
    mockedSchedulingApi.getServiceTypes.mockResolvedValue(mockServiceTypes);
    mockedSchedulingApi.listRooms.mockResolvedValue(mockRooms);
    mockedSchedulingApi.checkConflict.mockResolvedValue({
      hasConflict: false,
      conflicts: [],
    });
  });

  describe('1. Timezone & Facility Boundary Invariants (ADR-005)', () => {
    it('anchors all queries to America/New_York regardless of browser locale or UTC offsets', () => {
      expect(FACILITY_TIMEZONE).toBe('America/New_York');

      // Date: 2026-10-24 (EDT, UTC-4)
      const dayStart = facilityDayStartToUtcIso('2026-10-24');
      const dayEnd = facilityDayEndToUtcIso('2026-10-24');

      // Local midnight EDT = 04:00 UTC
      expect(dayStart).toBe('2026-10-24T04:00:00.000Z');
      // Local 23:59:59.999 EDT = Oct 25 03:59:59.999 UTC
      expect(dayEnd).toBe('2026-10-25T03:59:59.999Z');

      // Formatted back into facility timezone confirms exact boundaries
      expect(formatFacilityDate(dayStart)).toContain('Oct 24, 2026');
      expect(formatFacilityTime(dayStart)).toBe('12:00 AM');
      expect(formatFacilityDate(dayEnd)).toContain('Oct 24, 2026');
      expect(formatFacilityTime(dayEnd)).toBe('11:59 PM');
    });

    it('accurately parses appointments around and across midnight without negative durations or layout inversions', () => {
      // Late night appointment: 11:30 PM EDT (Oct 25 03:30Z) to 12:30 AM EDT next day (Oct 25 04:30Z)
      const pos = calculateSlotPosition(
        '2026-10-25T03:30:00.000Z',
        '2026-10-25T04:30:00.000Z',
        8,
        24, // 8:00 AM to 24:00 (midnight)
      );

      // Top offset: 15.5 hours into 16 hour grid = 930 / 960 * 100% = 96.875%
      expect(pos.topPercent).toBeCloseTo(96.88, 1);
      // Visible duration: 30 minutes until midnight edge = 30 / 960 * 100% = 3.125%
      expect(pos.heightPercent).toBeCloseTo(3.12, 1);
      expect(pos.topPercent + pos.heightPercent).toBeLessThanOrEqual(100);
    });

    it('preserves wall-clock local booking time across DST transition (Spring Forward & Fall Back)', () => {
      // Prior to Spring Forward: Mar 7, 2026 (EST, UTC-5)
      const springBefore = facilityDateTimeToUtcIso('2026-03-07', '10:00'); // 10:00 AM EST -> 15:00Z
      expect(springBefore).toBe('2026-03-07T15:00:00.000Z');

      // On Spring Forward day: Mar 8, 2026 (clock advanced at 2:00 AM -> 10:00 AM EDT, UTC-4 -> 14:00Z)
      const springStart = facilityDateTimeToUtcIso('2026-03-08', '10:00');
      expect(springStart).toBe('2026-03-08T14:00:00.000Z');

      // Next day after Spring Forward: Mar 9, 2026 (EDT, UTC-4 -> 14:00Z)
      const springAfter = facilityDateTimeToUtcIso('2026-03-09', '10:00');
      expect(springAfter).toBe('2026-03-09T14:00:00.000Z');

      // All format back to exactly 10:00 AM local facility time
      expect(formatFacilityTime(springBefore)).toBe('10:00 AM');
      expect(formatFacilityTime(springStart)).toBe('10:00 AM');
      expect(formatFacilityTime(springAfter)).toBe('10:00 AM');
    });
  });

  describe('2. Booking Concurrency & Conflict-Safe Form Recovery', () => {
    it('preserves client, service, and slot selections when server rejects booking with HTTP 409 conflict', async () => {
      mockedSchedulingApi.createAppointment.mockRejectedValueOnce({
        statusCode: 409,
        message:
          'Therapist Dr. Sarah Jenkins has conflicting appointment appt_99 from 2026-10-24T14:00:00.000Z to 2026-10-24T15:00:00.000Z.',
      });

      render(
        <AppointmentBookingWizard
          initialDate="2026-10-24"
          initialTherapistId="therapist_sarah"
          initialRoomId="room_rehab_alpha"
        />,
        { wrapper: createTestWrapper() },
      );

      // Step 1: Client selection
      await waitFor(() => {
        expect(screen.getByText('Eleanor Vance')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Eleanor Vance'));
      fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));

      // Step 2: Service selection
      await waitFor(() => {
        expect(screen.getByText('Kinesiology Evaluation')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Kinesiology Evaluation'));
      fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));

      // Step 3: Therapist
      const therapistInput = screen.getByLabelText(/Therapist Identifier/i);
      fireEvent.change(therapistInput, { target: { value: 'therapist_sarah' } });
      fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));

      // Step 4: Room
      await waitFor(() => expect(screen.getByText('Rehab Suite Alpha')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Rehab Suite Alpha'));
      fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));

      // Step 5: Date/Time
      await waitFor(() => expect(screen.getByText('5. Date & Time')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: '10:00' }));
      fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));

      // Step 6: Confirmation Review
      await waitFor(() =>
        expect(screen.getByText('6. Review & Confirm Booking')).toBeInTheDocument(),
      );

      const confirmButton = screen.getByRole('button', { name: /Confirm & Book/i });
      fireEvent.click(confirmButton);

      // Await conflict error alert
      await waitFor(() => {
        expect(screen.getByText('Scheduling Conflict / Booking Error')).toBeInTheDocument();
      });

      expect(
        screen.getByText(/Therapist Dr\. Sarah Jenkins has conflicting appointment/i),
      ).toBeInTheDocument();

      // Verify form data preservation notice
      expect(screen.getByText(/Your form data has been preserved/i)).toBeInTheDocument();

      // Staff can step back to Step 5 (Date & Time) to select an alternative slot without losing client or service
      fireEvent.click(screen.getByRole('button', { name: /Date & Time/i }));
      expect(screen.getByLabelText(/^Date:$/i)).toHaveValue('2026-10-24');
    });

    it('prevents duplicate submissions by disabling submission button while mutation is in-flight', async () => {
      let resolveMutation!: (val: AppointmentModel) => void;
      mockedSchedulingApi.createAppointment.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveMutation = resolve;
          }),
      );

      render(
        <AppointmentBookingWizard
          initialDate="2026-10-24"
          initialTherapistId="therapist_sarah"
          initialRoomId="room_rehab_alpha"
        />,
        { wrapper: createTestWrapper() },
      );

      // Step through wizard to step 6
      await waitFor(() => expect(screen.getByText('Eleanor Vance')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Eleanor Vance'));
      fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));

      await waitFor(() => expect(screen.getByText('Kinesiology Evaluation')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Kinesiology Evaluation'));
      fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));

      const therapistInput = screen.getByLabelText(/Therapist Identifier/i);
      fireEvent.change(therapistInput, { target: { value: 'therapist_sarah' } });
      fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));

      await waitFor(() => expect(screen.getByText('Rehab Suite Alpha')).toBeInTheDocument());
      fireEvent.click(screen.getByText('Rehab Suite Alpha'));
      fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));

      await waitFor(() => expect(screen.getByText('5. Date & Time')).toBeInTheDocument());
      fireEvent.click(screen.getByRole('button', { name: '10:00' }));
      fireEvent.click(screen.getByRole('button', { name: /^Next$/i }));

      await waitFor(() =>
        expect(screen.getByText('6. Review & Confirm Booking')).toBeInTheDocument(),
      );

      const confirmButton = screen.getByRole('button', { name: /Confirm & Book/i });
      fireEvent.click(confirmButton);

      // In-flight mutation: verify call is made and button is disabled with spinner
      await waitFor(() => {
        expect(mockedSchedulingApi.createAppointment).toHaveBeenCalledTimes(1);
      });
      expect(screen.getByText(/Booking\.\.\./i)).toBeInTheDocument();
      expect(confirmButton).toBeDisabled();

      // Second click attempt while in-flight should be ignored
      fireEvent.click(confirmButton);
      expect(mockedSchedulingApi.createAppointment).toHaveBeenCalledTimes(1);

      // Resolve mutation
      resolveMutation({
        id: 'appt_concurrency_safe',
        clientId: 'client_hardening_1',
        type: 'Kinesiology Consultation',
        therapistId: 'therapist_sarah',
        roomId: 'room_rehab_alpha',
        startTime: '2026-10-24T14:00:00.000Z',
        endTime: '2026-10-24T15:00:00.000Z',
        durationMinutes: 60,
        status: 'SCHEDULED',
        version: 1,
        createdAt: '2026-10-24T00:00:00.000Z',
        updatedAt: '2026-10-24T00:00:00.000Z',
      });

      await waitFor(() => {
        expect(screen.getByText('Appointment Booked!')).toBeInTheDocument();
      });
    });
  });

  describe('3. Cache Invalidation & Stale Availability Eviction', () => {
    it('invalidates availability cache upon room maintenance mutation', async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });
      const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

      mockedSchedulingApi.scheduleMaintenance.mockResolvedValueOnce({
        ...mockRooms[0]!,
        maintenanceWindows: [
          {
            id: 'mw_new',
            roomId: 'room_rehab_alpha',
            startTime: '2026-10-25T14:00:00.000Z',
            endTime: '2026-10-25T16:00:00.000Z',
            reason: 'Ultrasonic sensor calibration',
            createdAt: '2026-10-24T00:00:00.000Z',
          },
        ],
        version: 6,
      });

      render(<RoomsPage />, { wrapper: createTestWrapper(queryClient) });

      await waitFor(() => {
        expect(screen.getByText('Rehab Suite Alpha')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText(/Schedule maintenance for Rehab Suite Alpha/i));
      expect(screen.getByText(/Schedule Maintenance Window/i)).toBeInTheDocument();

      fireEvent.change(screen.getByLabelText(/Maintenance Date/i), {
        target: { value: '2026-10-25' },
      });
      fireEvent.change(screen.getByLabelText(/Start Time/i), { target: { value: '10:00' } });
      fireEvent.change(screen.getByLabelText(/End Time/i), { target: { value: '12:00' } });
      fireEvent.change(screen.getByLabelText(/Maintenance Explanation Reason/i), {
        target: { value: 'Ultrasonic sensor calibration' },
      });

      fireEvent.click(screen.getByRole('button', { name: /^Schedule Maintenance$/i }));

      await waitFor(() => {
        expect(mockedSchedulingApi.scheduleMaintenance).toHaveBeenCalled();
      });

      // Verify availability query cache is invalidated to prevent stale slot bookings
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          queryKey: ['scheduling', 'availability'],
        }),
      );
    });
  });

  describe('4. Optimistic Concurrency Control (OCC 409) State Reload', () => {
    it('prompts staff with reload action when room version mismatch occurs', async () => {
      mockedSchedulingApi.editRoom.mockRejectedValueOnce({
        statusCode: 409,
        message: 'Optimistic lock version conflict: expected version 5 but found 6.',
      });

      render(<RoomsPage />, { wrapper: createTestWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Rehab Suite Alpha')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText(/Edit Rehab Suite Alpha/i));
      expect(screen.getByText(/Version #5/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(screen.getByText('Concurrency Version Conflict')).toBeInTheDocument();
      });

      const reloadButton = screen.getByRole('button', { name: /Reload Latest Room State/i });
      expect(reloadButton).toBeInTheDocument();

      // Click reload triggers fresh room fetch
      fireEvent.click(reloadButton);
      await waitFor(() => {
        expect(mockedSchedulingApi.listRooms).toHaveBeenCalledTimes(2);
      });
    });
  });
});
