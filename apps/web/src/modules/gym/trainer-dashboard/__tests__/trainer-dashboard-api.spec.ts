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

  it('should fetch assigned clients for a designated trainer', async () => {
    const mockData = [
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
    ];

    (httpClient.get as jest.Mock).mockResolvedValueOnce(mockData);

    const result = await trainerDashboardApi.getAssignedClients({
      trainerId: 'trainer_01',
      horizonDays: 7,
    });

    expect(httpClient.get).toHaveBeenCalledWith('/api/v1/gym/memberships/assigned', {
      params: {
        trainerId: 'trainer_01',
        statuses: undefined,
        horizonDays: 7,
      },
    });
    expect(result).toEqual(mockData);
  });

  it('should return empty list if trainerId is empty', async () => {
    const result = await trainerDashboardApi.getAssignedClients({
      trainerId: '',
    });
    expect(result).toEqual([]);
    expect(httpClient.get).not.toHaveBeenCalled();
  });

  it('should fetch expiring clients for trainer', async () => {
    const mockData = [
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
        isCurrentlyFrozen: false,
        assignedAt: '2026-07-25T00:00:00.000Z',
      },
    ];

    (httpClient.get as jest.Mock).mockResolvedValueOnce(mockData);

    const result = await trainerDashboardApi.getExpiringClients({
      trainerId: 'trainer_01',
      horizonDays: 7,
    });

    expect(httpClient.get).toHaveBeenCalledWith('/api/v1/gym/memberships/expiring', {
      params: {
        trainerId: 'trainer_01',
        horizonDays: 7,
      },
    });
    expect(result).toEqual(mockData);
  });

  it('should fetch today check-ins filtered to assigned client IDs', async () => {
    const mockItems = [
      {
        id: 'att_01',
        clientId: 'client_1',
        membershipId: 'mem_1',
        checkInTime: '2026-08-22T09:30:00.000Z',
        gymDay: '2026-08-22',
        facilityId: 'main',
        method: 'RFID',
        result: 'GRANTED',
        gateId: 'Gate 1',
        receptionistId: null,
        notes: null,
      },
    ];

    (httpClient.get as jest.Mock).mockResolvedValueOnce({ items: mockItems });

    const result = await trainerDashboardApi.getTodayAssignedCheckIns(['client_1', 'client_2']);

    expect(httpClient.get).toHaveBeenCalledWith('/api/v1/gym/attendance/today', {
      params: {
        assignedClientIds: 'client_1,client_2',
        limit: 50,
      },
    });
    expect(result).toEqual(mockItems);
  });

  it('should return empty list for check-ins if no assigned clients', async () => {
    const result = await trainerDashboardApi.getTodayAssignedCheckIns([]);
    expect(result).toEqual([]);
    expect(httpClient.get).not.toHaveBeenCalled();
  });
});
