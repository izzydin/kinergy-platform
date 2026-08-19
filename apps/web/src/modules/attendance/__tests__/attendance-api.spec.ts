import { httpClient } from '../../../shared/api/http-client';
import { attendanceApi } from '../api/attendance-api';
import { CheckInMethod } from '../types';

jest.mock('../../../shared/api/http-client');

const mockedHttpClient = httpClient as jest.Mocked<typeof httpClient>;

describe('Phase 5.5-G: Attendance API Client Spec', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('1. Searches clients by query parameter', async () => {
    const mockClients = [
      { id: 'client_1', fullName: 'Jane Doe', email: 'jane@example.com', status: 'ACTIVE' },
    ];
    mockedHttpClient.get.mockResolvedValueOnce(mockClients);

    const result = await attendanceApi.searchClients('Jane');

    expect(mockedHttpClient.get).toHaveBeenCalledWith('/api/v1/clients/search', {
      params: { q: 'Jane' },
    });
    expect(result).toEqual(mockClients);
  });

  it('2. Evaluates authoritative membership eligibility for client', async () => {
    const mockEligibility = {
      isEligible: true,
      outcome: 'ELIGIBLE',
      membershipId: 'mem_1',
      planId: 'plan_gold',
      period: { startDate: '2026-08-01', endDate: '2026-09-01' },
      evaluatedAt: '2026-08-19T10:00:00.000Z',
      reason: null,
    };
    mockedHttpClient.get.mockResolvedValueOnce(mockEligibility);

    const result = await attendanceApi.checkEligibility('client_1');

    expect(mockedHttpClient.get).toHaveBeenCalledWith(
      '/api/v1/gym/memberships/eligibility/client_1',
    );
    expect(result).toEqual(mockEligibility);
  });

  it('3. Submits check-in admission payload to backend', async () => {
    const payload = {
      clientId: 'client_1',
      method: CheckInMethod.RFID,
      gateId: 'gate_1',
      idempotencyKey: 'idem_key_1',
    };
    const mockResponse = {
      isGranted: true,
      outcome: 'GRANTED',
      attendanceId: 'att_123',
      clientId: 'client_1',
      membershipId: 'mem_1',
      planId: 'plan_gold',
      checkInTime: '2026-08-19T10:00:00.000Z',
      gymDay: { localDate: '2026-08-19', timezone: 'America/Guayaquil', facilityId: 'main' },
      method: CheckInMethod.RFID,
      gateId: 'gate_1',
      receptionistId: null,
      isDuplicate: false,
      isIdempotentReplay: false,
      denialReason: null,
    };
    mockedHttpClient.post.mockResolvedValueOnce(mockResponse);

    const result = await attendanceApi.recordCheckIn(payload);

    expect(mockedHttpClient.post).toHaveBeenCalledWith('/api/v1/gym/attendance/check-in', payload);
    expect(result).toEqual(mockResponse);
  });

  it("4. Retrieves today's live attendance feed with pagination", async () => {
    const mockFeed = {
      items: [],
      pagination: {
        page: 1,
        limit: 15,
        totalItems: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      },
      dailySummary: {
        totalCheckIns: 0,
        grantedCount: 0,
        deniedCount: 0,
        uniqueClientsCount: 0,
      },
    };
    mockedHttpClient.get.mockResolvedValueOnce(mockFeed);

    const result = await attendanceApi.getTodayAttendance({ page: 1, limit: 15 });

    expect(mockedHttpClient.get).toHaveBeenCalledWith('/api/v1/gym/attendance/today', {
      params: { page: 1, limit: 15 },
    });
    expect(result).toEqual(mockFeed);
  });
});
