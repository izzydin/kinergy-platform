import { httpClient } from '../../../../shared/api/http-client';
import { trainerDashboardApi } from '../api/trainer-dashboard-api';

jest.mock('../../../../shared/api/http-client', () => ({
  httpClient: {
    get: jest.fn(),
  },
}));

describe('Trainer Dashboard API Client Spec', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch operational summary KPIs from /api/v1/gym/trainer-dashboard/summary', async () => {
    const mockSummary = {
      totalAssignedClients: 12,
      activeMembershipsCount: 10,
      expiringSoonMembershipsCount: 2,
      frozenMembershipsCount: 1,
      todayGrantedCheckInsCount: 4,
      asOfDate: '2026-08-22T00:00:00.000Z',
      horizonDays: 7,
    };

    (httpClient.get as jest.Mock).mockResolvedValueOnce(mockSummary);

    const result = await trainerDashboardApi.getSummary({
      trainerId: 'trainer_01',
      horizonDays: 7,
    });

    expect(httpClient.get).toHaveBeenCalledWith('/api/v1/gym/trainer-dashboard/summary', {
      params: {
        trainerId: 'trainer_01',
        horizonDays: 7,
        asOfDate: undefined,
        timezone: undefined,
        facilityId: undefined,
      },
    });
    expect(result).toEqual(mockSummary);
  });

  it('should fetch paginated assigned clients from /api/v1/gym/trainer-dashboard/clients', async () => {
    const mockClientsResponse = {
      items: [
        {
          membershipId: 'mem_1',
          clientId: 'client_1',
          planId: 'plan_std',
          planName: 'Standard Monthly',
          status: 'ACTIVE',
          startDate: '2026-08-01T00:00:00.000Z',
          endDate: '2026-09-01T00:00:00.000Z',
          daysRemaining: 10,
          isExpiringSoon: false,
          isExpired: false,
          isCurrentlyFrozen: false,
          assignedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    };

    (httpClient.get as jest.Mock).mockResolvedValueOnce(mockClientsResponse);

    const result = await trainerDashboardApi.getAssignedClients({
      trainerId: 'trainer_01',
      page: 1,
      limit: 10,
      sortBy: 'daysRemaining',
      sortOrder: 'ASC',
      statuses: ['ACTIVE'],
    });

    expect(httpClient.get).toHaveBeenCalledWith('/api/v1/gym/trainer-dashboard/clients', {
      params: {
        trainerId: 'trainer_01',
        statuses: 'ACTIVE',
        horizonDays: undefined,
        asOfDate: undefined,
        page: 1,
        limit: 10,
        sortBy: 'daysRemaining',
        sortOrder: 'ASC',
      },
    });
    expect(result).toEqual(mockClientsResponse);
  });

  it('should fetch expiring memberships from /api/v1/gym/trainer-dashboard/expiring-memberships', async () => {
    const mockExpiringResponse = {
      items: [
        {
          membershipId: 'mem_2',
          clientId: 'client_2',
          planId: 'plan_vip',
          planName: 'VIP Monthly',
          status: 'ACTIVE',
          startDate: '2026-07-25T00:00:00.000Z',
          endDate: '2026-08-25T00:00:00.000Z',
          daysRemaining: 3,
          isExpiringSoon: true,
          isExpired: false,
        },
      ],
      total: 1,
      horizonDays: 7,
    };

    (httpClient.get as jest.Mock).mockResolvedValueOnce(mockExpiringResponse);

    const result = await trainerDashboardApi.getExpiringMemberships({
      trainerId: 'trainer_01',
      horizonDays: 7,
    });

    expect(httpClient.get).toHaveBeenCalledWith(
      '/api/v1/gym/trainer-dashboard/expiring-memberships',
      {
        params: {
          trainerId: 'trainer_01',
          horizonDays: 7,
          asOfDate: undefined,
        },
      },
    );
    expect(result).toEqual(mockExpiringResponse);
  });

  it('should fetch attendance check-ins from /api/v1/gym/trainer-dashboard/attendance', async () => {
    const mockAttendanceResponse = {
      items: [
        {
          id: 'att_01',
          clientId: 'client_1',
          membershipId: 'mem_1',
          checkInTime: '2026-08-22T09:30:00.000Z',
          gymDay: '2026-08-22',
          method: 'RFID',
          result: 'GRANTED',
          gateId: 'Gate 1',
        },
      ],
      total: 1,
      grantedCount: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    };

    (httpClient.get as jest.Mock).mockResolvedValueOnce(mockAttendanceResponse);

    const result = await trainerDashboardApi.getAttendance({
      trainerId: 'trainer_01',
      limit: 20,
    });

    expect(httpClient.get).toHaveBeenCalledWith('/api/v1/gym/trainer-dashboard/attendance', {
      params: {
        trainerId: 'trainer_01',
        date: undefined,
        facilityId: undefined,
        timezone: undefined,
        page: undefined,
        limit: 20,
      },
    });
    expect(result).toEqual(mockAttendanceResponse);
  });
});
