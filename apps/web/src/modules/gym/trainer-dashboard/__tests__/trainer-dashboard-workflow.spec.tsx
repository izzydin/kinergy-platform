import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { TrainerDashboardPage } from '../routes/trainer-dashboard-page';
import { useAuth } from '../../../../app/providers/auth-provider';
import { useTrainerDashboardSummary } from '../hooks/use-trainer-dashboard-summary';
import { useAssignedClients } from '../hooks/use-assigned-clients';
import { useExpiringMemberships } from '../hooks/use-expiring-memberships';
import { useTrainerAttendance } from '../hooks/use-trainer-attendance';
import { useClientSearch, useClientEligibility } from '../../attendance/hooks/use-gym-attendance';
import { AccessResult, CheckInMethod, MembershipEligibilityOutcome } from '../types';

jest.mock('../../../../app/providers/auth-provider');
jest.mock('../hooks/use-trainer-dashboard-summary');
jest.mock('../hooks/use-assigned-clients');
jest.mock('../hooks/use-expiring-memberships');
jest.mock('../hooks/use-trainer-attendance');
jest.mock('../../attendance/hooks/use-gym-attendance');

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
        fullName: 'client_alpha',
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
        assignedTrainerId: 'usr_trainer_1',
        lastAttendanceDate: '2026-08-20T10:00:00.000Z',
      },
      {
        membershipId: 'mem_102',
        clientId: 'client_beta',
        fullName: 'client_beta',
        planId: 'plan_vip',
        planName: 'VIP Training Pass',
        status: 'FROZEN',
        startDate: '2026-07-01T00:00:00.000Z',
        endDate: '2027-07-01T00:00:00.000Z',
        daysRemaining: 313,
        isExpiringSoon: false,
        isExpired: false,
        isCurrentlyFrozen: true,
        assignedAt: '2026-07-01T00:00:00.000Z',
        assignedTrainerId: null,
        lastAttendanceDate: null,
      },
      {
        membershipId: 'mem_103',
        clientId: 'client_gamma',
        fullName: 'client_gamma',
        planId: 'plan_basic',
        planName: 'Basic Membership',
        status: 'ACTIVE',
        startDate: '2026-06-01T00:00:00.000Z',
        endDate: '2026-12-01T00:00:00.000Z',
        daysRemaining: 100,
        isExpiringSoon: false,
        isExpired: false,
        isCurrentlyFrozen: false,
        assignedAt: '2026-06-01T00:00:00.000Z',
        assignedTrainerId: 'usr_trainer_99',
        lastAttendanceDate: '2026-08-15T09:00:00.000Z',
      },
    ],
    total: 3,
    page: 1,
    limit: 10,
    totalPages: 1,
  };

  const mockExpiringMemberships = {
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
      },
    ],
    total: 1,
    horizonDays: 7,
  };

  const mockAttendance = {
    items: [
      {
        id: 'att_201',
        clientId: 'client_alpha',
        membershipId: 'mem_101',
        checkInTime: '2026-08-22T08:30:00.000Z',
        gymDay: '2026-08-22',
        method: CheckInMethod.QR_CODE,
        result: AccessResult.GRANTED,
        gateId: 'turnstile_1',
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
        id: 'usr_trainer_1',
        email: 'trainer@kinergy.test',
        roles: ['Trainer'],
        permissions: ['clients.read', 'memberships.read'],
      },
      isAuthenticated: true,
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
      data: mockExpiringMemberships,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    mockUseTrainerAttendance.mockReturnValue({
      data: mockAttendance,
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
        clientId: 'client_alpha',
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

  it('2. In-memory filter on client roster works cleanly', async () => {
    renderDashboard();

    const searchInput = screen.getByLabelText('Filter roster');
    fireEvent.change(searchInput, { target: { value: 'client_alpha' } });

    await waitFor(() => {
      expect(screen.queryByText('client_beta')).not.toBeInTheDocument();
    });
    expect(screen.getByText('client_alpha')).toBeInTheDocument();
  });

  it('3. Selects a client for detailed inspection', async () => {
    renderDashboard();

    const detailsButtons = screen.getAllByRole('button', { name: /Details/i });
    expect(detailsButtons.length).toBeGreaterThan(0);
    fireEvent.click(detailsButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText(/Client Inspection:/i)).toBeInTheDocument();
    });
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

  it('5. Displays facility-wide client roster with assignment badges and last attendance dates', () => {
    renderDashboard();

    // Verification of trainer assignment badges
    expect(screen.getByTestId('trainer-badge-me')).toHaveTextContent('Assigned to You');
    expect(screen.getByTestId('trainer-badge-unassigned')).toHaveTextContent('Unassigned');
    expect(screen.getByTestId('trainer-badge-other')).toHaveTextContent('usr_trainer_99');

    // Verification of last check-in dates
    expect(screen.getByText('No visits yet')).toBeInTheDocument();
    expect(
      screen.getByText(new Date('2026-08-20T10:00:00.000Z').toLocaleDateString()),
    ).toBeInTheDocument();
  });

  it('6. Supports assignment filter dropdown for facility-wide roster navigation', () => {
    renderDashboard();

    const assignmentSelect = screen.getByTestId('assignment-filter-select');
    expect(assignmentSelect).toBeInTheDocument();

    fireEvent.change(assignmentSelect, { target: { value: 'ASSIGNED_TO_ME' } });
    expect(assignmentSelect).toHaveValue('ASSIGNED_TO_ME');
  });

  it('7. Safely sanitizes malformed numbers in KPI summary banner without rendering corrupt suffixes', () => {
    mockUseSummary.mockReturnValue({
      data: {
        totalAssignedClients: 2,
        activeMembershipsCount: '1,m' as unknown as number,
        expiringSoonMembershipsCount: 0,
        frozenMembershipsCount: 2,
        todayGrantedCheckInsCount: 4,
        asOfDate: '2026-08-22T00:00:00.000Z',
        horizonDays: 7,
      },
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    renderDashboard();

    // Verify Active Passes displays sanitized '1', never '1,m'
    const banner = screen.getByTestId('kpi-banner-container');
    expect(screen.queryByText('1,m')).not.toBeInTheDocument();
    expect(within(banner).getByText('1')).toBeInTheDocument();
  });

  it('8. Attendance feed badge reconciles numerator and denominator safely', () => {
    mockUseTrainerAttendance.mockReturnValue({
      data: {
        items: [],
        total: 4,
        grantedCount: 4,
        page: 1,
        limit: 20,
        totalPages: 1,
      },
      isLoading: false,
      isError: false,
      isFetching: false,
      refetch: jest.fn(),
    });

    renderDashboard();

    expect(screen.getByText('4 / 4 Granted')).toBeInTheDocument();
    expect(screen.queryByText('4 / 0 Granted')).not.toBeInTheDocument();
  });
});
