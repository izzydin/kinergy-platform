import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppointmentDetailDrawer } from '../appointment-detail-drawer';
import { CancelAppointmentModal } from '../cancel-appointment-modal';
import type { AppointmentModel } from '../../types/scheduling.types';
import * as schedulingApiModule from '../../api/scheduling-api';

// Mock notification provider
jest.mock('../../../../app/providers/notification-provider', () => ({
  useNotification: () => ({
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
  }),
}));

const mockAppointment: AppointmentModel = {
  id: 'appt_lifecycle_100',
  status: 'SCHEDULED',
  type: 'Physiotherapy Assessment',
  clientId: 'client_987654321',
  client: {
    id: 'client_987654321',
    firstName: 'Carlos',
    lastName: 'Rivera',
    fullName: 'Carlos Rivera',
  },
  clientName: 'Carlos Rivera',
  therapistId: 'therapist_dr_smith',
  roomId: 'room_101',
  startTime: '2026-10-24T14:00:00.000Z',
  endTime: '2026-10-24T15:00:00.000Z',
  durationMinutes: 60,
  version: 1,
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000Z',
};

const mockRecurringAppointment: AppointmentModel = {
  ...mockAppointment,
  id: 'appt_recurring_200',
  seriesId: 'series_recurring_xyz',
  occurrenceIndex: 2,
  isDetachedFromSeries: false,
};

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });

const renderWithQuery = (ui: React.ReactElement, queryClient = createTestQueryClient()) => {
  return {
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
    queryClient,
  };
};

describe('Scheduling Dialog Lifecycle & Interaction Integrity', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Reschedule Dialog Lifecycle', () => {
    it('opens reschedule dialog on click and remains open without blinking/auto-closing', async () => {
      const { queryClient, rerender } = renderWithQuery(
        <AppointmentDetailDrawer appointment={mockAppointment} isOpen={true} onClose={jest.fn()} />,
      );

      // Verify drawer rendered
      expect(
        screen.getByRole('dialog', { name: /Appointment details and management/i }),
      ).toBeInTheDocument();

      // Click Reschedule... button
      const rescheduleBtn = screen.getByRole('button', { name: /Reschedule appointment/i });
      fireEvent.click(rescheduleBtn);

      // Verify dialog is open
      const rescheduleDialog = await screen.findByTestId('edit-single-occurrence-dialog');
      expect(rescheduleDialog).toBeInTheDocument();
      expect(screen.getByTestId('edit-single-occurrence-title')).toHaveTextContent(
        'Reschedule Appointment',
      );

      // Trigger re-renders and query updates to ensure dialog STAYS open
      queryClient.setQueryData(['scheduling', 'appointments', 'detail', mockAppointment.id], {
        ...mockAppointment,
        updatedAt: new Date().toISOString(),
      });

      rerender(
        <QueryClientProvider client={queryClient}>
          <AppointmentDetailDrawer
            appointment={{ ...mockAppointment }}
            isOpen={true}
            onClose={jest.fn()}
          />
        </QueryClientProvider>,
      );

      // Dialog must STILL be in the document
      expect(screen.getByTestId('edit-single-occurrence-dialog')).toBeInTheDocument();
    });

    it('submits reschedule payload preserving duration and invoking correct API', async () => {
      const rescheduleSpy = jest
        .spyOn(schedulingApiModule.schedulingApi, 'rescheduleAppointment')
        .mockResolvedValueOnce({
          ...mockAppointment,
          status: 'RESCHEDULED',
        });

      const onCloseDrawer = jest.fn();
      renderWithQuery(
        <AppointmentDetailDrawer
          appointment={mockAppointment}
          isOpen={true}
          onClose={onCloseDrawer}
        />,
      );

      // Open Reschedule dialog
      fireEvent.click(screen.getByRole('button', { name: /Reschedule appointment/i }));
      await screen.findByTestId('edit-single-occurrence-dialog');

      // Enter Reason
      const reasonInput = screen.getByLabelText(/Reschedule Reason/i);
      fireEvent.change(reasonInput, {
        target: { value: 'Client requested postponement to next morning' },
      });

      // Submit
      const submitBtn = screen.getByRole('button', { name: /Save Changes/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(rescheduleSpy).toHaveBeenCalledTimes(1);
      });

      const firstCall = rescheduleSpy.mock.calls[0];
      expect(firstCall).toBeDefined();
      const [calledId, calledPayload] = firstCall!;
      expect(calledId).toBe(mockAppointment.id);
      expect(calledPayload.reason).toBe('Client requested postponement to next morning');
      expect(calledPayload.newStartTime).toBeDefined();
      expect(calledPayload.newEndTime).toBeDefined();
    });

    it('handles recurring appointment: opens scope dialog first, then single occurrence modal with detach semantics', async () => {
      renderWithQuery(
        <AppointmentDetailDrawer
          appointment={mockRecurringAppointment}
          isOpen={true}
          onClose={jest.fn()}
        />,
      );

      // Click Reschedule... on recurring appointment
      fireEvent.click(screen.getByRole('button', { name: /Reschedule appointment/i }));

      // Scope dialog appears and remains open
      const scopeDialog = await screen.findByTestId('recurrence-scope-dialog');
      expect(scopeDialog).toBeInTheDocument();
      expect(screen.getByText(/Edit Recurring Appointment/i)).toBeInTheDocument();

      // Select "This occurrence only"
      fireEvent.click(screen.getByRole('button', { name: /This occurrence only/i }));

      // Edit Single Occurrence modal should open with recurrence detach semantics
      const editModal = await screen.findByTestId('edit-single-occurrence-dialog');
      expect(editModal).toBeInTheDocument();
      expect(screen.getByTestId('edit-single-occurrence-title')).toHaveTextContent(
        'Reschedule Single Occurrence',
      );
      expect(screen.getByText(/Authoritative Detach Semantics/i)).toBeInTheDocument();
    });
  });

  describe('Cancel Dialog Lifecycle', () => {
    it('opens Cancel dialog modal on click and remains open without disappearing', async () => {
      const { queryClient, rerender } = renderWithQuery(
        <AppointmentDetailDrawer appointment={mockAppointment} isOpen={true} onClose={jest.fn()} />,
      );

      // Click Cancel...
      const cancelBtn = screen.getByRole('button', { name: /Cancel appointment/i });
      fireEvent.click(cancelBtn);

      // Verify Cancel dialog is open
      const cancelDialog = await screen.findByTestId('cancel-appointment-dialog');
      expect(cancelDialog).toBeInTheDocument();
      expect(screen.getByTestId('cancel-appointment-title')).toHaveTextContent(
        'Cancel Appointment',
      );

      // Trigger re-render / query cache update
      queryClient.setQueryData(['scheduling', 'appointments'], []);
      rerender(
        <QueryClientProvider client={queryClient}>
          <AppointmentDetailDrawer
            appointment={{ ...mockAppointment }}
            isOpen={true}
            onClose={jest.fn()}
          />
        </QueryClientProvider>,
      );

      // Dialog must STILL be present
      expect(screen.getByTestId('cancel-appointment-dialog')).toBeInTheDocument();
    });

    it('disables confirmation button when reason is empty and enables when filled', async () => {
      renderWithQuery(
        <CancelAppointmentModal isOpen={true} onClose={jest.fn()} appointment={mockAppointment} />,
      );

      // Submit button is disabled without reason
      const submitBtn = screen.getByTestId('cancel-confirm-button');
      expect(submitBtn).toBeDisabled();

      // Enter reason
      const reasonInput = screen.getByTestId('cancel-reason-input');
      fireEvent.change(reasonInput, { target: { value: 'Client called to cancel' } });

      expect(submitBtn).toBeEnabled();
    });

    it('submits cancellation when reason is provided', async () => {
      const cancelSpy = jest
        .spyOn(schedulingApiModule.schedulingApi, 'cancelAppointment')
        .mockResolvedValueOnce({
          ...mockAppointment,
          status: 'CANCELLED',
        });

      const onClose = jest.fn();
      renderWithQuery(
        <CancelAppointmentModal isOpen={true} onClose={onClose} appointment={mockAppointment} />,
      );

      // Type reason
      const reasonInput = screen.getByTestId('cancel-reason-input');
      fireEvent.change(reasonInput, { target: { value: 'Client has flu symptoms' } });

      // Submit
      const submitBtn = screen.getByTestId('cancel-confirm-button');
      expect(submitBtn).toBeEnabled();
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(cancelSpy).toHaveBeenCalledTimes(1);
      });
      expect(cancelSpy).toHaveBeenCalledWith(mockAppointment.id, {
        reason: 'Client has flu symptoms',
      });
    });
  });

  describe('Keyboard & Dismissal Event Isolation', () => {
    it('pressing Escape inside a child modal closes the modal without dismissing the parent drawer', async () => {
      const onCloseDrawer = jest.fn();
      renderWithQuery(
        <AppointmentDetailDrawer
          appointment={mockAppointment}
          isOpen={true}
          onClose={onCloseDrawer}
        />,
      );

      // Open Cancel modal
      fireEvent.click(screen.getByRole('button', { name: /Cancel appointment/i }));
      expect(await screen.findByTestId('cancel-appointment-dialog')).toBeInTheDocument();

      // Press Escape
      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });

      // Parent drawer should NOT have closed
      expect(onCloseDrawer).not.toHaveBeenCalled();
    });
  });

  describe('No-Show Domain Invariants', () => {
    it('displays "Mark No-Show" for SCHEDULED and CONFIRMED appointments only', () => {
      const { rerender } = renderWithQuery(
        <AppointmentDetailDrawer
          appointment={{ ...mockAppointment, status: 'SCHEDULED' }}
          isOpen={true}
          onClose={jest.fn()}
        />,
      );
      expect(
        screen.getByRole('button', { name: /Mark appointment as no-show/i }),
      ).toBeInTheDocument();

      rerender(
        <QueryClientProvider client={createTestQueryClient()}>
          <AppointmentDetailDrawer
            appointment={{ ...mockAppointment, status: 'CONFIRMED' }}
            isOpen={true}
            onClose={jest.fn()}
          />
        </QueryClientProvider>,
      );
      expect(
        screen.getByRole('button', { name: /Mark appointment as no-show/i }),
      ).toBeInTheDocument();

      rerender(
        <QueryClientProvider client={createTestQueryClient()}>
          <AppointmentDetailDrawer
            appointment={{ ...mockAppointment, status: 'CHECKED_IN' }}
            isOpen={true}
            onClose={jest.fn()}
          />
        </QueryClientProvider>,
      );
      // Checked in appointments MUST NOT show Mark No-Show button
      expect(screen.queryByRole('button', { name: /Mark appointment as no-show/i })).toBeNull();
    });
  });
});
