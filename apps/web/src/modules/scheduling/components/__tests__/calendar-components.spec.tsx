import React from 'react';
import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CalendarStatusBadge, ConflictBadge } from '../calendar-status-badge';
import { AppointmentCard } from '../appointment-card';
import { AppointmentDetailDrawer } from '../appointment-detail-drawer';
import type { AppointmentModel } from '../../types/scheduling.types';

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
  id: 'appt_test_1',
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
  roomId: 'Room 101',
  startTime: '2026-10-24T14:00:00.000Z', // 10:00 AM EDT
  endTime: '2026-10-24T15:00:00.000Z', // 11:00 AM EDT
  durationMinutes: 60,
  version: 1,
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000Z',
  notes: [
    {
      id: 'note_1',
      authorId: 'therapist_dr_smith',
      content: 'Lower back pain rehabilitation',
      createdAt: '2026-10-20T10:00:00.000Z',
    },
  ],
};

const renderWithQuery = (ui: React.ReactElement) => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
};

describe('Calendar Components', () => {
  describe('CalendarStatusBadge', () => {
    it('renders scheduled status badge with clock icon and accessible label', () => {
      render(<CalendarStatusBadge status="SCHEDULED" />);
      const badge = screen.getByLabelText(/Appointment status: Scheduled/i);
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('Scheduled');
    });

    it('renders confirmed status badge with check icon', () => {
      render(<CalendarStatusBadge status="CONFIRMED" />);
      const badge = screen.getByLabelText(/Appointment status: Confirmed/i);
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('Confirmed');
    });

    it('renders checked-in status badge', () => {
      render(<CalendarStatusBadge status="CHECKED_IN" />);
      expect(screen.getByLabelText(/Appointment status: Checked In/i)).toBeInTheDocument();
    });

    it('renders in-progress status badge', () => {
      render(<CalendarStatusBadge status="IN_PROGRESS" />);
      expect(screen.getByLabelText(/Appointment status: In Progress/i)).toBeInTheDocument();
    });

    it('renders completed status badge', () => {
      render(<CalendarStatusBadge status="COMPLETED" />);
      expect(screen.getByLabelText(/Appointment status: Completed/i)).toBeInTheDocument();
    });

    it('renders cancelled status badge', () => {
      render(<CalendarStatusBadge status="CANCELLED" />);
      expect(screen.getByLabelText(/Appointment status: Cancelled/i)).toBeInTheDocument();
    });

    it('renders no-show status badge', () => {
      render(<CalendarStatusBadge status="NO_SHOW" />);
      expect(screen.getByLabelText(/Appointment status: No Show/i)).toBeInTheDocument();
    });
  });

  describe('ConflictBadge', () => {
    it('renders authoritative conflict status role and label', () => {
      render(<ConflictBadge />);
      const conflict = screen.getByRole('status', {
        name: /Schedule conflict detected by system/i,
      });
      expect(conflict).toBeInTheDocument();
      expect(conflict).toHaveTextContent('Conflict');
    });
  });

  describe('AppointmentCard', () => {
    it('renders appointment details in facility timezone with client full name and assessment note', () => {
      render(<AppointmentCard appointment={mockAppointment} variant="detailed" />);
      // 14:00 - 15:00 UTC = 10:00 AM – 11:00 AM EDT
      expect(screen.getByText(/10:00 AM – 11:00 AM/i)).toBeInTheDocument();
      expect(screen.getByTestId('appointment-card-client-name')).toHaveTextContent('Carlos Rivera');
      expect(screen.getByText('Physiotherapy Assessment')).toBeInTheDocument();
      expect(screen.getByText(/Assessment: Lower back pain rehabilitation/i)).toBeInTheDocument();
      expect(screen.getByText(/Room: Room 101/i)).toBeInTheDocument();
    });

    it('renders client full name in compact weekly view', () => {
      render(<AppointmentCard appointment={mockAppointment} variant="compact" />);
      expect(screen.getByTestId('appointment-card-client-name')).toHaveTextContent('Carlos Rivera');
      expect(screen.getByText(/10:00 AM – 11:00 AM/i)).toBeInTheDocument();
      expect(screen.getByText('Physiotherapy Assessment')).toBeInTheDocument();
    });

    it('renders client full name in month chip view', () => {
      render(<AppointmentCard appointment={mockAppointment} variant="month-chip" />);
      expect(screen.getByText('10:00 AM')).toBeInTheDocument();
      expect(screen.getByTestId('month-chip-client-name')).toHaveTextContent('Carlos Rivera');
      expect(screen.getByText('Physiotherapy Assessment')).toBeInTheDocument();
    });

    it('falls back to "Client information unavailable" when client name is missing', () => {
      const anonymizedAppt: AppointmentModel = {
        ...mockAppointment,
        client: undefined,
        clientName: undefined,
      };
      render(<AppointmentCard appointment={anonymizedAppt} variant="detailed" />);
      expect(screen.getByTestId('appointment-card-client-name')).toHaveTextContent(
        'Client information unavailable',
      );
      // Ensure raw technical ID is NOT displayed
      expect(screen.queryByText(/client_987654321/i)).toBeNull();
    });

    it('does NOT render conflict badge when appointment has no conflict', () => {
      render(<AppointmentCard appointment={mockAppointment} />);
      expect(screen.queryByRole('status', { name: /Schedule conflict detected/i })).toBeNull();
    });

    it('renders authoritative conflict badge ONLY when hasConflict is true in data', () => {
      const conflictedAppt = {
        ...mockAppointment,
        hasConflict: true,
      };
      render(<AppointmentCard appointment={conflictedAppt} />);
      expect(
        screen.getByRole('status', { name: /Schedule conflict detected/i }),
      ).toBeInTheDocument();
    });

    it('invokes onSelect on click or when Enter/Space key is pressed', () => {
      const onSelect = jest.fn();
      render(<AppointmentCard appointment={mockAppointment} onSelect={onSelect} />);

      const card = screen.getByRole('button');
      fireEvent.click(card);
      expect(onSelect).toHaveBeenCalledWith(mockAppointment);

      fireEvent.keyDown(card, { key: 'Enter' });
      expect(onSelect).toHaveBeenCalledTimes(2);

      fireEvent.keyDown(card, { key: ' ' });
      expect(onSelect).toHaveBeenCalledTimes(3);
    });
  });

  describe('AppointmentDetailDrawer', () => {
    it('does not render when isOpen is false', () => {
      renderWithQuery(
        <AppointmentDetailDrawer
          appointment={mockAppointment}
          isOpen={false}
          onClose={jest.fn()}
        />,
      );
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('renders client full name prominently without technical Client ID label', () => {
      renderWithQuery(
        <AppointmentDetailDrawer appointment={mockAppointment} isOpen={true} onClose={jest.fn()} />,
      );

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByTestId('appointment-client-section')).toBeInTheDocument();
      expect(screen.getByTestId('appointment-client-name')).toHaveTextContent('Carlos Rivera');
      // Assert that technical client ID prefix is never displayed to users
      expect(screen.queryByText(/Client ID:/i)).toBeNull();
      expect(screen.queryByText(/Client: client_987654321/i)).toBeNull();

      expect(screen.getByText('Appointment Details')).toBeInTheDocument();
      expect(screen.getByText('Physiotherapy Assessment')).toBeInTheDocument();
      expect(screen.getByText(/America\/New_York/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Confirm appointment/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Check in client/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cancel appointment/i })).toBeInTheDocument();
    });

    it('displays neutral fallback "Client information unavailable" in drawer when client is missing', () => {
      const missingClientAppt: AppointmentModel = {
        ...mockAppointment,
        client: undefined,
        clientName: undefined,
      };
      renderWithQuery(
        <AppointmentDetailDrawer
          appointment={missingClientAppt}
          isOpen={true}
          onClose={jest.fn()}
        />,
      );

      expect(screen.getByTestId('appointment-client-name')).toHaveTextContent(
        'Client information unavailable',
      );
      expect(screen.queryByText(/Client ID:/i)).toBeNull();
      expect(screen.queryByText(/Client: client_987654321/i)).toBeNull();
    });

    it('handles close button click', () => {
      const onClose = jest.fn();
      renderWithQuery(
        <AppointmentDetailDrawer appointment={mockAppointment} isOpen={true} onClose={onClose} />,
      );

      fireEvent.click(screen.getByRole('button', { name: /Close appointment details/i }));
      expect(onClose).toHaveBeenCalled();
    });

    it('renders "Open Treatment Session" and does NOT render "Start Treatment" when treatmentSessionId is present', () => {
      const apptWithSession: AppointmentModel = {
        ...mockAppointment,
        treatmentSessionId: 'sess-12345',
      };
      renderWithQuery(
        <AppointmentDetailDrawer
          appointment={apptWithSession}
          isOpen={true}
          onClose={jest.fn()}
          canTreatKinesiology={true}
          canReadKinesiology={true}
        />,
      );

      expect(
        screen.getByRole('button', { name: /Open treatment session sess-12345/i }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /Start clinical kinesiology treatment session/i }),
      ).toBeNull();
      expect(screen.queryByRole('button', { name: /^Start Treatment$/i })).toBeNull();
    });

    it('displays completed state and does NOT render "Start Treatment" when appointment is COMPLETED', () => {
      const completedAppt: AppointmentModel = {
        ...mockAppointment,
        status: 'COMPLETED',
        treatmentSessionId: undefined,
      };
      renderWithQuery(
        <AppointmentDetailDrawer
          appointment={completedAppt}
          isOpen={true}
          onClose={jest.fn()}
          canTreatKinesiology={true}
        />,
      );

      expect(
        screen.getByText(/No clinical session was linked to this appointment prior to completion/i),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Start Treatment$/i })).toBeNull();
    });

    it('renders "Start Treatment" for eligible CONFIRMED appointment when no session exists', () => {
      const activeAppt: AppointmentModel = {
        ...mockAppointment,
        status: 'CONFIRMED',
        treatmentSessionId: undefined,
      };
      renderWithQuery(
        <AppointmentDetailDrawer
          appointment={activeAppt}
          isOpen={true}
          onClose={jest.fn()}
          canTreatKinesiology={true}
          canReadKinesiology={true}
        />,
      );

      expect(screen.getByRole('button', { name: /^Start Treatment$/i })).toBeInTheDocument();
    });
  });
});
