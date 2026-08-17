import { kinesiologyApi } from '../api/kinesiology-api';
import { httpClient } from '../../../shared/api/http-client';

jest.mock('../../../shared/api/http-client', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
  },
}));

describe('Kinesiology API Client Unit Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('invokes getSessionById with correct endpoint', async () => {
    (httpClient.get as jest.Mock).mockResolvedValueOnce({ id: 'sess_123' });

    const result = await kinesiologyApi.getSessionById('sess_123');

    expect(httpClient.get).toHaveBeenCalledWith('/api/v1/kinesiology/sessions/sess_123');
    expect(result).toEqual({ id: 'sess_123' });
  });

  it('invokes startSession with correct endpoint', async () => {
    (httpClient.post as jest.Mock).mockResolvedValueOnce({ id: 'sess_123', status: 'IN_PROGRESS' });

    const result = await kinesiologyApi.startSession('sess_123');

    expect(httpClient.post).toHaveBeenCalledWith('/api/v1/kinesiology/sessions/sess_123/start');
    expect(result.status).toBe('IN_PROGRESS');
  });

  it('invokes completeSession with correct endpoint', async () => {
    (httpClient.post as jest.Mock).mockResolvedValueOnce({ id: 'sess_123', status: 'COMPLETED' });

    const result = await kinesiologyApi.completeSession('sess_123');

    expect(httpClient.post).toHaveBeenCalledWith('/api/v1/kinesiology/sessions/sess_123/complete');
    expect(result.status).toBe('COMPLETED');
  });

  it('invokes updateNotes with PUT payload', async () => {
    (httpClient.put as jest.Mock).mockResolvedValueOnce({ id: 'sess_123' });

    await kinesiologyApi.updateNotes('sess_123', {
      subjective: 'Pain resolved',
    });

    expect(httpClient.put).toHaveBeenCalledWith('/api/v1/kinesiology/sessions/sess_123/notes', {
      subjective: 'Pain resolved',
    });
  });

  it('invokes getClientTreatmentHistory with search params', async () => {
    (httpClient.get as jest.Mock).mockResolvedValueOnce({ items: [], total: 0 });

    await kinesiologyApi.getClientTreatmentHistory('client_456', {
      page: 2,
      limit: 10,
      status: 'COMPLETED',
    });

    expect(httpClient.get).toHaveBeenCalledWith(
      '/api/v1/kinesiology/clients/client_456/treatment-history',
      {
        params: { page: 2, limit: 10, status: 'COMPLETED' },
      },
    );
  });
});
