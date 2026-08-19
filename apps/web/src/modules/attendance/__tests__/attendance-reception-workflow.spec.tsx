import '@testing-library/jest-dom';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AttendanceReceptionPage } from '../routes/attendance-reception-page';
import {
  useClientSearch,
  useClientEligibility,
  useRecordCheckInMutation,
  useTodayAttendance,
} from '../hooks/use-attendance';
import { AccessResult, CheckInMethod, MembershipEligibilityOutcome } from '../types';

jest.mock('../hooks/use-attendance');

const mockUseClientSearch = useClientSearch as jest.Mock;
const mockUseClientEligibility = useClientEligibility as jest.Mock;
const mockUseRecordCheckInMutation = useRecordCheckInMutation as jest.Mock;
const mockUseTodayAttendance = useTodayAttendance as jest.Mock;

describe('Phase 5.5-G: Daily Reception Workflow Frontend Component Spec', () => {
  const mockMutate = jest.fn();

  beforeEach(() => {
    mockUseRecordCheckInMutation.mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });

    mockUseTodayAttendance.mockReturnValue({
      data: {
        items: [
          {
            id: 'att_001',
            clientId: 'client_active_100',
            membershipId: 'mem_1',
            checkInTime: '2026-08-19T10:00:00.000Z',
            gymDay: '2026-08-19',
            facilityId: 'main',
            method: CheckInMethod.RFID,
            result: AccessResult.GRANTED,
            gateId: 'Turnstile 1',
            receptionistId: null,
            notes: null,
          },
        ],
        pagination: {
          page: 1,
          limit: 15,
          totalItems: 1,
          totalPages: 1,
          hasNextPage: false,
          hasPreviousPage: false,
        },
        dailySummary: {
          totalCheckIns: 1,
          grantedCount: 1,
          deniedCount: 0,
          uniqueClientsCount: 1,
        },
      },
      isLoading: false,
      error: null,
      isFetching: false,
    });

    mockUseClientSearch.mockReturnValue({
      data: [
        {
          id: 'client_active_100',
          fullName: 'Carlos Santana',
          email: 'carlos@example.com',
          status: 'ACTIVE',
        },
      ],
      isLoading: false,
    });

    mockUseClientEligibility.mockReturnValue({
      data: {
        isEligible: true,
        outcome: MembershipEligibilityOutcome.ELIGIBLE,
        membershipId: 'mem_100',
        planId: 'plan_gold_unlimited',
        period: {
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-09-01T00:00:00.000Z',
        },
        evaluatedAt: '2026-08-19T10:00:00.000Z',
        reason: null,
      },
      isLoading: false,
      error: null,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('1. Renders the complete reception workspace and KPI dashboard', () => {
    render(
      <MemoryRouter>
        <AttendanceReceptionPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/Gym Admission & Reception/i)).toBeInTheDocument();
    expect(screen.getByTestId('kpi-total-scans')).toHaveTextContent('1');
    expect(screen.getByTestId('kpi-granted-entries')).toHaveTextContent('1');
    expect(screen.getByTestId('today-attendance-table')).toBeInTheDocument();
    expect(screen.getByText('client_active_100')).toBeInTheDocument();
  });

  it('2. Searches, selects a client, and displays authoritative backend eligibility', async () => {
    render(
      <MemoryRouter>
        <AttendanceReceptionPage />
      </MemoryRouter>,
    );

    const searchInput = screen.getByTestId('client-search-input');
    fireEvent.change(searchInput, { target: { value: 'Carlos' } });

    // Client dropdown option should be visible
    await waitFor(() => {
      expect(screen.getByTestId('client-result-client_active_100')).toBeInTheDocument();
    });

    // Click client option
    fireEvent.click(screen.getByTestId('client-result-client_active_100'));

    // Verify selected client and backend eligibility status badge
    expect(screen.getByTestId('selected-client-card')).toBeInTheDocument();
    expect(screen.getByText('Carlos Santana')).toBeInTheDocument();
    expect(screen.getByTestId('eligibility-status-badge')).toHaveTextContent('✓ ELIGIBLE TO ENTER');
    expect(screen.getByText('plan_gold_unlimited')).toBeInTheDocument();
  });

  it('3. Submits check-in admission when clicking Record Check-In button', async () => {
    render(
      <MemoryRouter>
        <AttendanceReceptionPage />
      </MemoryRouter>,
    );

    // Select client
    const searchInput = screen.getByTestId('client-search-input');
    fireEvent.change(searchInput, { target: { value: 'Carlos' } });
    await waitFor(() => {
      expect(screen.getByTestId('client-result-client_active_100')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('client-result-client_active_100'));

    // Click Check-In
    const checkInBtn = screen.getByTestId('submit-check-in-btn');
    fireEvent.click(checkInBtn);

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 'client_active_100',
        method: CheckInMethod.MANUAL_RECEPTION,
      }),
      expect.any(Object),
    );
  });

  it('4. Correctly displays EXPIRED membership badge without computing dates on client side', async () => {
    mockUseClientEligibility.mockReturnValue({
      data: {
        isEligible: false,
        outcome: MembershipEligibilityOutcome.EXPIRED,
        membershipId: 'mem_expired_99',
        planId: 'plan_standard_monthly',
        period: {
          startDate: '2026-07-01T00:00:00.000Z',
          endDate: '2026-08-01T00:00:00.000Z',
        },
        evaluatedAt: '2026-08-19T10:00:00.000Z',
        reason: 'Membership expired on 2026-08-01.',
      },
      isLoading: false,
      error: null,
    });

    render(
      <MemoryRouter>
        <AttendanceReceptionPage />
      </MemoryRouter>,
    );

    const searchInput = screen.getByTestId('client-search-input');
    fireEvent.change(searchInput, { target: { value: 'Carlos' } });
    await waitFor(() => {
      expect(screen.getByTestId('client-result-client_active_100')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('client-result-client_active_100'));

    expect(screen.getByTestId('eligibility-status-badge')).toHaveTextContent(
      '✕ MEMBERSHIP EXPIRED',
    );
    expect(screen.getByText(/Membership expired on 2026-08-01/i)).toBeInTheDocument();
  });
});
