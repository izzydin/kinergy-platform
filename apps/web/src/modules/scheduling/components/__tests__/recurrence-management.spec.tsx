import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RecurrenceScopeDialog,
  EditSingleOccurrenceModal,
  EditFutureSeriesModal,
  SkipOccurrenceModal,
  CancelSeriesModal,
} from '../recurrence';
import { AppointmentDetailDrawer } from '../appointment-detail-drawer';
import { AppointmentBookingWizard } from '../appointment-booking-wizard';
import { schedulingApi } from '../../api/scheduling-api';
import { clientApi } from '../../../client/api/client-api';
import type {
  AppointmentModel,
  RecurrenceSeriesModel,
  RoomModel,
  ServiceTypeOptionDTO,
} from '../../types/scheduling.types';

// Mock APIs
jest.mock('../../api/scheduling-api');
const mockedSchedulingApi = schedulingApi as jest.Mocked<typeof schedulingApi>;

jest.mock('../../../client/api/client-api');
const mockedClientApi = clientApi as jest.Mocked<typeof clientApi>;

// Mock Notification Provider
jest.mock('../../../../app/providers/notification-provider', () => ({
  useNotification: () => ({
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
  }),
}));

const mockRecurringAppt: AppointmentModel = {
  id: 'appt_rec_1',
  status: 'SCHEDULED',
  type: 'Kinesiology Consultation',
  clientId: 'client_101',
  therapistId: 'therapist_sarah',
  roomId: 'room_1',
  startTime: '2026-10-24T14:00:00.000Z', // 10:00 AM EDT
  endTime: '2026-10-24T15:00:00.000Z',
  durationMinutes: 60,
  seriesId: 'series_abc_123',
  occurrenceIndex: 2,
  isDetachedFromSeries: false,
  version: 1,
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000Z',
};

const mockRooms: RoomModel[] = [
  {
    id: 'room_1',
    name: 'Treatment Studio A',
    capacity: 2,
    status: 'AVAILABLE',
    features: ['Rehab Table'],
    maintenanceWindows: [],
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'room_2',
    name: 'Treatment Studio B',
    capacity: 1,
    status: 'AVAILABLE',
    features: [],
    maintenanceWindows: [],
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

const mockServiceTypes: ServiceTypeOptionDTO[] = [
  {
    type: 'Kinesiology Consultation',
    label: 'Kinesiology Consultation',
    standardDurationMinutes: 60,
    minDurationMinutes: 30,
    maxDurationMinutes: 120,
  },
];

const createTestWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('Recurrence Management & Occurrence Exceptions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('RecurrenceScopeDialog', () => {
    it('renders edit choices: "This occurrence only" and "This and all future occurrences"', () => {
      const onSelectScope = jest.fn();
      render(
        <RecurrenceScopeDialog
          isOpen={true}
          onClose={jest.fn()}
          appointment={mockRecurringAppt}
          actionType="edit"
          onSelectScope={onSelectScope}
        />,
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Edit Recurring Appointment')).toBeInTheDocument();
      expect(screen.getByText('Occurrence #3 • Oct 24, 2026 at 10:00 AM')).toBeInTheDocument();

      const singleChoice = screen.getByText('This occurrence only');
      expect(singleChoice).toBeInTheDocument();
      fireEvent.click(singleChoice);
      expect(onSelectScope).toHaveBeenCalledWith('edit-single');

      const futureChoice = screen.getByText('This and all future occurrences');
      expect(futureChoice).toBeInTheDocument();
      fireEvent.click(futureChoice);
      expect(onSelectScope).toHaveBeenCalledWith('edit-future');
    });

    it('renders cancellation choices: "Skip this occurrence only" and "Cancel entire series"', () => {
      const onSelectScope = jest.fn();
      render(
        <RecurrenceScopeDialog
          isOpen={true}
          onClose={jest.fn()}
          appointment={mockRecurringAppt}
          actionType="cancel"
          onSelectScope={onSelectScope}
        />,
      );

      expect(screen.getByText('Cancel Recurring Appointment')).toBeInTheDocument();

      const skipChoice = screen.getByText('Skip this occurrence only');
      expect(skipChoice).toBeInTheDocument();
      fireEvent.click(skipChoice);
      expect(onSelectScope).toHaveBeenCalledWith('skip-single');

      const cancelSeriesChoice = screen.getByText('Cancel entire series');
      expect(cancelSeriesChoice).toBeInTheDocument();
      fireEvent.click(cancelSeriesChoice);
      expect(onSelectScope).toHaveBeenCalledWith('cancel-series');
    });
  });

  describe('EditSingleOccurrenceModal', () => {
    it('detaches occurrence and updates schedule with mandatory reason', async () => {
      mockedSchedulingApi.editSingleOccurrence.mockResolvedValueOnce({
        ...mockRecurringAppt,
        isDetachedFromSeries: true,
        startTime: '2026-10-24T15:00:00.000Z',
      });

      const onSuccess = jest.fn();
      const onClose = jest.fn();

      render(
        <EditSingleOccurrenceModal
          isOpen={true}
          onClose={onClose}
          appointment={mockRecurringAppt}
          rooms={mockRooms}
          onSuccess={onSuccess}
        />,
        { wrapper: createTestWrapper() },
      );

      expect(screen.getByText('Reschedule Single Occurrence')).toBeInTheDocument();
      expect(screen.getByText(/Authoritative Detach Semantics/i)).toBeInTheDocument();

      const reasonInput = screen.getByLabelText(/Reschedule Reason/i);
      fireEvent.change(reasonInput, {
        target: { value: 'Client requested 1 hour later due to schedule change' },
      });

      const submitBtn = screen.getByRole('button', { name: /Save & Detach/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockedSchedulingApi.editSingleOccurrence).toHaveBeenCalledWith(
          'appt_rec_1',
          expect.objectContaining({
            rescheduleReason: 'Client requested 1 hour later due to schedule change',
          }),
        );
      });

      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });

    it('displays server conflict error and keeps form data intact', async () => {
      mockedSchedulingApi.editSingleOccurrence.mockRejectedValueOnce({
        statusCode: 409,
        message: 'Therapist is unavailable for the selected slot',
      });

      render(
        <EditSingleOccurrenceModal
          isOpen={true}
          onClose={jest.fn()}
          appointment={mockRecurringAppt}
          rooms={mockRooms}
        />,
        { wrapper: createTestWrapper() },
      );

      const reasonInput = screen.getByLabelText(/Reschedule Reason/i);
      fireEvent.change(reasonInput, {
        target: { value: 'Testing conflict handling' },
      });

      fireEvent.click(screen.getByRole('button', { name: /Save & Detach/i }));

      await waitFor(() => {
        expect(screen.getByText('Unable to Reschedule Occurrence')).toBeInTheDocument();
      });
      expect(screen.getByText(/Therapist is unavailable/i)).toBeInTheDocument();
      expect(reasonInput).toHaveValue('Testing conflict handling');
    });
  });

  describe('EditFutureSeriesModal (Cutoff-and-Fork)', () => {
    it('executes Cutoff-and-Fork with updated frequency, local time, and rooms', async () => {
      mockedSchedulingApi.editFutureOccurrences.mockResolvedValueOnce({
        oldSeriesId: 'series_abc_123',
        newSeries: {
          id: 'series_def_456',
        } as unknown as RecurrenceSeriesModel,
      });

      const onSuccess = jest.fn();
      const onClose = jest.fn();

      render(
        <EditFutureSeriesModal
          isOpen={true}
          onClose={onClose}
          appointment={mockRecurringAppt}
          rooms={mockRooms}
          onSuccess={onSuccess}
        />,
        { wrapper: createTestWrapper() },
      );

      expect(screen.getByText(/Edit Future Occurrences \(Cutoff & Fork\)/i)).toBeInTheDocument();
      expect(screen.getByText(/Authoritative Cutoff-and-Fork Semantics/i)).toBeInTheDocument();

      const freqSelect = screen.getByLabelText(/New Recurrence Frequency/i);
      fireEvent.change(freqSelect, { target: { value: 'BIWEEKLY' } });

      const submitBtn = screen.getByRole('button', { name: /Fork & Update Future Series/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(mockedSchedulingApi.editFutureOccurrences).toHaveBeenCalledWith(
          'series_abc_123',
          expect.objectContaining({
            cutoffDate: '2026-10-24T14:00:00.000Z',
            fromOccurrenceIndex: 2,
            newFrequency: 'BIWEEKLY',
          }),
        );
      });

      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('SkipOccurrenceModal', () => {
    it('submits slot skip exception with mandatory reason', async () => {
      mockedSchedulingApi.skipOccurrence.mockResolvedValueOnce({
        seriesId: 'series_abc_123',
        occurrenceIndex: 2,
        status: 'SKIPPED',
      });

      const onSuccess = jest.fn();
      const onClose = jest.fn();

      render(
        <SkipOccurrenceModal
          isOpen={true}
          onClose={onClose}
          appointment={mockRecurringAppt}
          onSuccess={onSuccess}
        />,
        { wrapper: createTestWrapper() },
      );

      expect(screen.getByText('Skip Occurrence #3')).toBeInTheDocument();
      const reasonInput = screen.getByLabelText(/Reason for Skipping/i);
      fireEvent.change(reasonInput, { target: { value: 'Client out of town' } });

      fireEvent.click(screen.getByRole('button', { name: /Skip Occurrence/i }));

      await waitFor(() => {
        expect(mockedSchedulingApi.skipOccurrence).toHaveBeenCalledWith('series_abc_123', {
          occurrenceIndex: 2,
          reason: 'Client out of town',
        });
      });

      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('CancelSeriesModal', () => {
    it('cancels entire recurring series with mandatory audit reason', async () => {
      mockedSchedulingApi.cancelRecurrenceSeries.mockResolvedValueOnce({
        seriesId: 'series_abc_123',
        cancelledCount: 8,
      });

      const onSuccess = jest.fn();
      const onClose = jest.fn();

      render(
        <CancelSeriesModal
          isOpen={true}
          onClose={onClose}
          appointment={mockRecurringAppt}
          onSuccess={onSuccess}
        />,
        { wrapper: createTestWrapper() },
      );

      expect(screen.getByText('Cancel Recurring Series')).toBeInTheDocument();
      const reasonInput = screen.getByLabelText(/Reason for Series Cancellation/i);
      fireEvent.change(reasonInput, { target: { value: 'Client discontinued treatment program' } });

      fireEvent.click(screen.getByRole('button', { name: /Cancel Entire Series/i }));

      await waitFor(() => {
        expect(mockedSchedulingApi.cancelRecurrenceSeries).toHaveBeenCalledWith(
          'series_abc_123',
          expect.objectContaining({
            reason: 'Client discontinued treatment program',
          }),
        );
      });

      expect(onSuccess).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('AppointmentDetailDrawer Recurrence Integration', () => {
    it('renders recurrence series badge, occurrence number, and explicit scoped action buttons', () => {
      render(
        <AppointmentDetailDrawer
          isOpen={true}
          onClose={jest.fn()}
          appointment={mockRecurringAppt}
          rooms={mockRooms}
        />,
        { wrapper: createTestWrapper() },
      );

      expect(screen.getByText('Recurring Series Member')).toBeInTheDocument();
      expect(screen.getByText('Occurrence #3')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Reschedule Occurrence/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Edit Future Series/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Skip Slot/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cancel Series/i })).toBeInTheDocument();
    });

    it('displays detached status for an occurrence already detached from series', () => {
      const detachedAppt: AppointmentModel = {
        ...mockRecurringAppt,
        isDetachedFromSeries: true,
      };

      render(
        <AppointmentDetailDrawer
          isOpen={true}
          onClose={jest.fn()}
          appointment={detachedAppt}
          rooms={mockRooms}
        />,
        { wrapper: createTestWrapper() },
      );

      expect(screen.getByText('Detached from Recurring Series')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Edit Future Series/i })).not.toBeInTheDocument();
    });

    it('opens RecurrenceScopeDialog when clicking Cancel... on a recurring appointment', () => {
      render(
        <AppointmentDetailDrawer
          isOpen={true}
          onClose={jest.fn()}
          appointment={mockRecurringAppt}
          rooms={mockRooms}
        />,
        { wrapper: createTestWrapper() },
      );

      const cancelBtn = screen.getByRole('button', { name: 'Cancel appointment' });
      fireEvent.click(cancelBtn);

      expect(screen.getByText('Cancel Recurring Appointment')).toBeInTheDocument();
      expect(screen.getByText('Skip this occurrence only')).toBeInTheDocument();
      expect(screen.getByText('Cancel entire series')).toBeInTheDocument();
    });
  });

  describe('AppointmentBookingWizard Recurrence Creation', () => {
    beforeEach(() => {
      mockedClientApi.searchClients.mockResolvedValue({
        items: [
          {
            id: 'client_101',
            referenceNumber: 'CLI-001',
            firstName: 'Alice',
            lastName: 'Smith',
            fullName: 'Alice Smith',
            email: 'alice@example.com',
            phone: '555-0101',
            status: 'ACTIVE',
            identityId: null,
            version: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        total: 1,
        page: 1,
        limit: 8,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      });

      mockedSchedulingApi.getServiceTypes.mockResolvedValue(mockServiceTypes);
      mockedSchedulingApi.listRooms.mockResolvedValue(mockRooms);
      mockedSchedulingApi.checkConflict.mockResolvedValue({
        hasConflict: false,
        conflicts: [],
      });
    });

    it('configures recurring series and submits CreateRecurrenceSeriesCommand', async () => {
      mockedSchedulingApi.createRecurrenceSeries.mockResolvedValueOnce({
        series: {
          id: 'series_new_999',
          clientId: 'client_101',
          therapistId: 'therapist_sarah',
          roomId: 'room_1',
          serviceType: 'Kinesiology Consultation',
          status: 'ACTIVE',
          pattern: {
            frequency: 'WEEKLY',
            startDate: '2026-10-24T14:00:00.000Z',
            maxOccurrences: 8,
            localStartTime: '10:00',
            durationMinutes: 60,
            timezone: 'America/New_York',
          },
          exceptions: [],
          version: 1,
          createdAt: '2026-10-24T10:00:00.000Z',
          updatedAt: '2026-10-24T10:00:00.000Z',
        },
        initialGeneration: {
          generatedCount: 8,
          skippedCount: 0,
          conflictCount: 0,
          existingCount: 0,
          conflictingOccurrences: [],
        },
      });

      render(<AppointmentBookingWizard isOpen={true} onClose={jest.fn()} />, {
        wrapper: createTestWrapper(),
      });

      // Step 1: Select client
      await waitFor(() => {
        expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Alice Smith'));
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      // Step 2: Select service
      await waitFor(() => {
        expect(screen.getByText('Kinesiology Consultation')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Kinesiology Consultation'));
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      // Step 3: Therapist
      const therapistInput = screen.getByLabelText(/Therapist Identifier/i);
      fireEvent.change(therapistInput, { target: { value: 'therapist_sarah' } });
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      // Step 4: Room
      await waitFor(() => {
        expect(screen.getByText('Treatment Studio A')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByText('Treatment Studio A'));
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      // Step 5: Date, Time & Recurrence Toggle
      await waitFor(() => {
        expect(screen.getByText(/Repeat Appointment \(Recurring Series\)/i)).toBeInTheDocument();
      });

      const repeatToggle = screen.getByLabelText(/Repeat Appointment \(Recurring Series\)/i);
      fireEvent.click(repeatToggle);

      // Verify projected preview dates appear
      await waitFor(() => {
        expect(screen.getByText('Projected Occurrences Preview')).toBeInTheDocument();
      });
      expect(screen.getByText(/Session #1:/i)).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      // Step 6: Review shows recurrence series
      await waitFor(() => {
        expect(screen.getByText(/Recurrence Series:/i)).toBeInTheDocument();
      });
      expect(screen.getByText(/WEEKLY/i)).toBeInTheDocument();

      // Submit
      const confirmBtn = screen.getByRole('button', { name: /Confirm & Create Series/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockedSchedulingApi.createRecurrenceSeries).toHaveBeenCalledWith(
          expect.objectContaining({
            clientId: 'client_101',
            therapistId: 'therapist_sarah',
            roomId: 'room_1',
            serviceType: 'Kinesiology Consultation',
            frequency: 'WEEKLY',
            localStartTime: '10:00',
            durationMinutes: 60,
            timezone: 'America/New_York',
          }),
        );
      });

      // Verify Step 7 success screen
      await waitFor(() => {
        expect(screen.getByText('Recurring Series Created!')).toBeInTheDocument();
      });
      expect(screen.getByText('series_new_999')).toBeInTheDocument();
      expect(screen.getByText(/8 appointments scheduled/i)).toBeInTheDocument();
    });
  });
});
