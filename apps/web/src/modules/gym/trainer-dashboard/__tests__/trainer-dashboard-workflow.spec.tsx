import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TrainerDashboardPage } from '../routes/trainer-dashboard-page';
import { useAuth } from '../../../../app/providers/auth-provider';
import {
  useTrainerDashboardSummary,
  useAssignedClients,
  useExpiringMemberships,
  useTrainerAttendance,
} from '../hooks';
import { useClientSearch, useClientEligibility } from '../../../attendance/hooks/use-attendance';
import { AccessResult, CheckInMethod, MembershipEligibilityOutcome } from '../types';

jest.mock('../../../../app/providers/auth-provider');
jest.mock('../hooks');
jest.mock('../../../attendance/hooks/use-attendance');

const mockUseAuth = useAuth as jest.Mock;
const mockUseSummary = useTrainerDashboardSummary as jest.Mock;
const mockUseAssignedClients = useAssignedClients as jest.Mock;
const mockUseExpiringMemberships = useExpiringMemberships as jest.Mock;
const mockUseTrainerAttendance = useTrainerAttendance as jest.Mock;
const mockUseClientSearch = useClientSearch as jest.Mock;
const mockUseClientEligibility = useClientEligibility as jest.Mock;

describe('Phase 5.6-F: Trainer Dashboard Frontend Spec', () => {
  const mockSummary = {
    totalAssignedClients: 2,
    activeMembershipsCount: 1,
    expiringSoonMembershipsCount: 1,
    frozenMembershipsCount: 1,
    todayGrantedCheckInsCount: 1,
    asOfDate: '2026-08-22T00:00:00.000Z',
    horizonDays: 7,
  };

  const mockAssignedClients = {
    items: [
      {
        membershipId: 'mem_101',
        clientId: 'client_alpha',
        planId: 'plan_std',
        planName: 'Standard Monthly',
        status: 'ACTIVE',
        startDate: '2026-08-01T00:00:00.000Z',
        endDate: '2026-08-25T00:00:00.000Z',
        daysRemaining: 3,
        isExpiringSoon: true,
        isExpired: false,
        isCurrentlyFrozen: false,
        assignedAt: '2026-08-01T00:00:00.000Z',
      },
      {
        membershipId: 'mem_102',
        clientId: 'client_beta',
        planId: 'plan_vip',
        planName: 'VIP Training Pass',
        status: 'FROZEN',
        startDate: '2026-07-01T00:00:00.000Z',
        endDate: '2026-09-15T00:00:00.000Z',
        daysRemaining: 24,
        isExpiringSoon: false,
        isExpired: false,
        isCurrentlyFrozen: true,
        assignedAt: '2026-07-01T00:00:00.000Z',
      },
    ],
    total: 2,
    page: 1,
    limit: 10,
    totalPages: 1,
  };

  const mockExpiringData = {
    items: [mockAssignedClients.items[0]],
    total: 1,
    horizonDays: 7,
  };

  const mockAttendanceData = {
    items: [
      {
        id: 'att_201',
        clientId: 'client_alpha',
        membershipId: 'mem_101',
        checkInTime: '2026-08-22T08:30:00.000Z',
        gymDay: '2026-08-22',
        method: CheckInMethod.RFID,
        result: AccessResult.GRANTED,
        gateId: 'Turnstile 1',
      },
    ],
    total: 1,
    grantedCount: 1,
    page: 1,
    limit: 20,
    totalPages: 1,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockUseAuth.mockReturnValue({
      currentUser: {
        id: 'trainer_007',
        email: 'trainer@kinergy.platform',
        roles: ['Trainer'],
        permissions: ['clients.read'],
      },
    });

    mockUseSummary.mockReturnValue({
      data: mockSummary,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    mockUseAssignedClients.mockReturnValue({
      data: mockAssignedClients,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    mockUseExpiringMemberships.mockReturnValue({
      data: mockExpiringData,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    mockUseTrainerAttendance.mockReturnValue({
      data: mockAttendanceData,
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
    });

    mockUseClientSearch.mockReturnValue({
      data: [],
      isLoading: false,
    });

    mockUseClientEligibility.mockReturnValue({
      data: {
        isEligible: true,
        outcome: MembershipEligibilityOutcome.ELIGIBLE,
        membershipId: 'mem_101',
        planId: 'plan_std',
        period: {
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-08-25T00:00:00.000Z',
        },
        evaluatedAt: '2026-08-22T10:00:00.000Z',
        reason: null,
      },
      isLoading: false,
      error: null,
    });
  });

  const renderDashboard = () =>
    render(
      <MemoryRouter>
        <TrainerDashboardPage />
      </MemoryRouter>,
    );

  it('1. Renders authoritative KPI summary banner and core operational sections', () => {
    renderDashboard();

    expect(screen.getByText('Trainer Operational Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Assigned Clients')).toBeInTheDocument();
    expect(screen.getByText('Active Passes')).toBeInTheDocument();
    expect(screen.getByText("Today's Client Visits")).toBeInTheDocument();

    // Table elements
    expect(screen.getAllByText('Assigned Client Roster')[0]).toBeInTheDocument();
    expect(screen.getByText('client_alpha')).toBeInTheDocument();
    expect(screen.getByText('client_beta')).toBeInTheDocument();
    expect(screen.getAllByText('Standard Monthly')[0]).toBeInTheDocument();
    expect(screen.getByText('VIP Training Pass')).toBeInTheDocument();

    // Expiring memberships section
    expect(screen.getByText(/Expiring Soon \(Next 7 Days\)/i)).toBeInTheDocument();

    // Attendance section
    expect(screen.getByText("Today's Check-Ins")).toBeInTheDocument();
  });

  it('2. In-memory filter on client roster works cleanly', () => {
    renderDashboard();

    const searchInput = screen.getByLabelText('Filter roster');
    fireEvent.change(searchInput, { target: { value: 'client_alpha' } });

    expect(screen.getByText('client_alpha')).toBeInTheDocument();
    expect(screen.queryByText('client_beta')).not.toBeInTheDocument();
  });

  it('3. Selects a client for detailed inspection', () => {
    renderDashboard();

    const detailsButtons = screen.getAllByRole('button', { name: /Details/i });
    expect(detailsButtons.length).toBeGreaterThan(0);
    fireEvent.click(detailsButtons[0]!);

    expect(screen.getByText(/Client Inspection:/i)).toBeInTheDocument();
    expect(screen.getAllByText(/client_alpha@kinergy.client/i).length).toBeGreaterThan(0);
  });

  it('4. Handles partial error states gracefully with retry action', () => {
    const mockRefetchSummary = jest.fn();
    mockUseSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetchSummary,
    });

    renderDashboard();

    expect(screen.getByText('Unable to load operational summary metrics.')).toBeInTheDocument();

    const retryBtn = screen.getByRole('button', { name: /Retry Summary/i });
    fireEvent.click(retryBtn);
    expect(mockRefetchSummary).toHaveBeenCalledTimes(1);

    // Other sections like roster remain accessible
    expect(screen.getAllByText('Assigned Client Roster')[0]).toBeInTheDocument();
  });
});
