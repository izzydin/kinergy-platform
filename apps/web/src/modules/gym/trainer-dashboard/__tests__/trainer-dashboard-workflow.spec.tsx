import '@testing-library/jest-dom';
import { render, screen, fireEvent } from '@testing-library/react';
import { TrainerDashboardPage } from '../routes/trainer-dashboard-page';
import { useAuth } from '../../../../app/providers/auth-provider';
import { useAssignedClients } from '../hooks/use-assigned-clients';
import { useExpiringClients } from '../hooks/use-expiring-clients';
import { useTodayAssignedCheckIns } from '../hooks/use-today-assigned-check-ins';
import { useClientEligibility, useClientSearch } from '../../../attendance/hooks/use-attendance';
import { AccessResult, CheckInMethod, MembershipEligibilityOutcome } from '../types';

jest.mock('../../../../app/providers/auth-provider');
jest.mock('../hooks/use-assigned-clients');
jest.mock('../hooks/use-expiring-clients');
jest.mock('../hooks/use-today-assigned-check-ins');
jest.mock('../../../attendance/hooks/use-attendance');

const mockUseAuth = useAuth as jest.Mock;
const mockUseAssignedClients = useAssignedClients as jest.Mock;
const mockUseExpiringClients = useExpiringClients as jest.Mock;
const mockUseTodayAssignedCheckIns = useTodayAssignedCheckIns as jest.Mock;
const mockUseClientEligibility = useClientEligibility as jest.Mock;
const mockUseClientSearch = useClientSearch as jest.Mock;

describe('Phase 5.6-A: Trainer Dashboard Operational Workflow Component Spec', () => {
  const mockAssignedClients = [
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
  ];

  const mockTodayCheckIns = [
    {
      id: 'att_201',
      clientId: 'client_alpha',
      membershipId: 'mem_101',
      checkInTime: '2026-08-22T08:30:00.000Z',
      gymDay: '2026-08-22',
      facilityId: 'main',
      method: CheckInMethod.RFID,
      result: AccessResult.GRANTED,
      gateId: 'Turnstile 1',
      receptionistId: null,
      notes: null,
    },
  ];

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

    mockUseAssignedClients.mockReturnValue({
      data: mockAssignedClients,
      isLoading: false,
      error: null,
      refetch: jest.fn(),
      isFetching: false,
    });

    mockUseExpiringClients.mockReturnValue({
      data: [mockAssignedClients[0]],
      isLoading: false,
      error: null,
    });

    mockUseTodayAssignedCheckIns.mockReturnValue({
      data: mockTodayCheckIns,
      isLoading: false,
      isFetching: false,
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

  it('1. Renders the 4 MVP operational sections with accurate KPI summary indicators', () => {
    render(<TrainerDashboardPage />);

    // Header & Badge
    expect(screen.getByText('Trainer Operational Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Gym Floor Operations')).toBeInTheDocument();

    // Section 1: KPI metrics
    expect(screen.getByTestId('kpi-assigned-clients')).toHaveTextContent('2');
    expect(screen.getByTestId('kpi-expiring-soon')).toHaveTextContent('1');
    expect(screen.getByTestId('kpi-currently-frozen')).toHaveTextContent('1');
    expect(screen.getByTestId('kpi-today-checkins')).toHaveTextContent('1');

    // Section 2: Proactive Expiring Soon Notice
    expect(
      screen.getByText(
        /1 of your assigned clients have memberships expiring within the next 7 days/i,
      ),
    ).toBeInTheDocument();

    // Section 3: Assigned Clients Directory Cards
    expect(screen.getByTestId('assigned-client-card-client_alpha')).toBeInTheDocument();
    expect(screen.getByTestId('assigned-client-card-client_beta')).toBeInTheDocument();
    expect(screen.getByText('Plan: Standard Monthly')).toBeInTheDocument();
    expect(screen.getByText('Plan: VIP Training Pass')).toBeInTheDocument();

    // Section 4: Today's check-ins table
    expect(screen.getByTestId('trainer-today-checkins-table')).toBeInTheDocument();
    expect(screen.getByTestId('trainer-check-in-row-att_201')).toBeInTheDocument();
  });

  it('2. Filters assigned clients by Expiring, Active, and Frozen tabs', () => {
    render(<TrainerDashboardPage />);

    // Click Expiring tab
    fireEvent.click(screen.getByTestId('filter-tab-expiring'));
    expect(screen.getByTestId('assigned-client-card-client_alpha')).toBeInTheDocument();
    expect(screen.queryByTestId('assigned-client-card-client_beta')).not.toBeInTheDocument();

    // Click Frozen tab
    fireEvent.click(screen.getByTestId('filter-tab-frozen'));
    expect(screen.queryByTestId('assigned-client-card-client_alpha')).not.toBeInTheDocument();
    expect(screen.getByTestId('assigned-client-card-client_beta')).toBeInTheDocument();

    // Click Active tab
    fireEvent.click(screen.getByTestId('filter-tab-active'));
    expect(screen.getByTestId('assigned-client-card-client_alpha')).toBeInTheDocument();
    expect(screen.queryByTestId('assigned-client-card-client_beta')).not.toBeInTheDocument();
  });

  it('3. Selects a client to inspect real-time authoritative membership eligibility', () => {
    render(<TrainerDashboardPage />);

    // Click "Check Status" on client_alpha
    const checkStatusBtn = screen.getByTestId('assigned-client-card-client_alpha');
    fireEvent.click(checkStatusBtn);

    // MembershipEligibilityCard should evaluate for client_alpha
    expect(mockUseClientEligibility).toHaveBeenCalledWith('client_alpha');
    expect(screen.getByTestId('membership-eligibility-card')).toBeInTheDocument();
    expect(screen.getByText('✓ ELIGIBLE TO ENTER')).toBeInTheDocument();
  });
});
