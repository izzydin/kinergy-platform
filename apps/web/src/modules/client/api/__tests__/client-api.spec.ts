import { clientApi } from '../client-api';
import { clientQueryKeys } from '../client-query-keys';
import {
  formatClientErrorMessage,
  isArchivedClientError,
  isForbiddenError,
  isHardDuplicateError,
  isNotFoundError,
  isOptimisticLockError,
  isPotentialDuplicatesWarning,
} from '../client-error';
import { httpClient } from '../../../../shared/api/http-client';
import {
  ConflictError,
  NotFoundError,
  AuthorizationError,
  ValidationError,
  ServerError,
  NetworkError,
} from '../../../../shared/api/api-error';

jest.mock('../../../../shared/api/http-client', () => ({
  httpClient: {
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
}));

describe('clientApi Transport Layer & Contract Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Search & List Operations', () => {
    it('searchClients invokes GET /api/v1/clients with default clean parameters', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce({ items: [], total: 0 });

      await clientApi.searchClients();

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/clients', {
        params: {
          query: undefined,
          status: undefined,
          includeArchived: undefined,
          createdFrom: undefined,
          createdTo: undefined,
          sortBy: undefined,
          sortOrder: undefined,
          page: undefined,
          limit: undefined,
        },
      });
    });

    it('searchClients maps query string from "q" and compound sort "name.asc"', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce({ items: [], total: 0 });

      await clientApi.searchClients({
        q: 'Sophia Miller',
        status: 'ACTIVE',
        includeArchived: false,
        sort: 'name.asc',
        page: 2,
        limit: 20,
      });

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/clients', {
        params: {
          query: 'Sophia Miller',
          status: 'ACTIVE',
          includeArchived: false,
          createdFrom: undefined,
          createdTo: undefined,
          sortBy: 'name',
          sortOrder: 'ASC',
          page: 2,
          limit: 20,
        },
      });
    });

    it('searchClients handles date range and explicit sort parameters', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce({ items: [], total: 0 });

      await clientApi.searchClients({
        query: 'Miller',
        createdFrom: '2026-01-01T00:00:00.000Z',
        createdTo: '2026-12-31T23:59:59.999Z',
        sortBy: 'updatedAt',
        sortOrder: 'DESC',
      });

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/clients', {
        params: {
          query: 'Miller',
          status: undefined,
          includeArchived: undefined,
          createdFrom: '2026-01-01T00:00:00.000Z',
          createdTo: '2026-12-31T23:59:59.999Z',
          sortBy: 'updatedAt',
          sortOrder: 'DESC',
          page: undefined,
          limit: undefined,
        },
      });
    });
  });

  describe('2. Single Client Profile Retrieval', () => {
    it('getClientProfile invokes GET /api/v1/clients/:id with encoded id', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce({
        id: 'c-123',
        fullName: 'Jane Doe',
      });

      const result = await clientApi.getClientProfile('c-123');

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/clients/c-123');
      expect(result).toEqual({ id: 'c-123', fullName: 'Jane Doe' });
    });
  });

  describe('3. Client Registration', () => {
    it('registerClient invokes POST /api/v1/clients with trimmed payload and default bypass flag', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({
        id: 'c-new',
        referenceNumber: 'CLI-2026-00001',
      });

      const payload = {
        firstName: '  Carlos  ',
        lastName: '  Santana ',
        email: '  carlos@example.com ',
        phone: '  +59170012345 ',
      };

      await clientApi.registerClient(payload);

      expect(httpClient.post).toHaveBeenCalledWith('/api/v1/clients', {
        firstName: 'Carlos',
        lastName: 'Santana',
        email: 'carlos@example.com',
        phone: '+59170012345',
        identityId: undefined,
        bypassSoftDuplicates: false,
      });
    });

    it('registerClient preserves optional identityId and bypassSoftDuplicates', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({ id: 'c-new' });

      await clientApi.registerClient({
        firstName: 'Maria',
        lastName: 'Perez',
        email: 'maria@example.com',
        phone: '+59170099999',
        identityId: 'user-auth-uuid-999',
        bypassSoftDuplicates: true,
      });

      expect(httpClient.post).toHaveBeenCalledWith('/api/v1/clients', {
        firstName: 'Maria',
        lastName: 'Perez',
        email: 'maria@example.com',
        phone: '+59170099999',
        identityId: 'user-auth-uuid-999',
        bypassSoftDuplicates: true,
      });
    });
  });

  describe('4. Client Details Update (Optimistic Concurrency)', () => {
    it('updateClient invokes PATCH /api/v1/clients/:id with If-Match header and expectedVersion', async () => {
      (httpClient.patch as jest.Mock).mockResolvedValueOnce({
        id: 'c-123',
        version: 2,
      });

      await clientApi.updateClient('c-123', {
        expectedVersion: 1,
        firstName: 'Jane Updated',
        phone: '+59170088888',
      });

      expect(httpClient.patch).toHaveBeenCalledWith(
        '/api/v1/clients/c-123',
        {
          expectedVersion: 1,
          firstName: 'Jane Updated',
          lastName: undefined,
          email: undefined,
          phone: '+59170088888',
        },
        {
          headers: {
            'If-Match': '"1"',
          },
        },
      );
    });
  });

  describe('5. Lifecycle Transitions (Archive & Restore)', () => {
    it('archiveClient invokes PATCH /api/v1/clients/:id/archive with If-Match when version provided', async () => {
      (httpClient.patch as jest.Mock).mockResolvedValueOnce({ id: 'c-123', status: 'ARCHIVED' });

      await clientApi.archiveClient('c-123', 3);

      expect(httpClient.patch).toHaveBeenCalledWith(
        '/api/v1/clients/c-123/archive',
        {},
        {
          headers: {
            'If-Match': '"3"',
          },
        },
      );
    });

    it('archiveClient invokes PATCH /api/v1/clients/:id/archive without If-Match when version omitted', async () => {
      (httpClient.patch as jest.Mock).mockResolvedValueOnce({ id: 'c-123', status: 'ARCHIVED' });

      await clientApi.archiveClient('c-123');

      expect(httpClient.patch).toHaveBeenCalledWith(
        '/api/v1/clients/c-123/archive',
        {},
        { headers: {} },
      );
    });

    it('restoreClient invokes PATCH /api/v1/clients/:id/restore with If-Match when version provided', async () => {
      (httpClient.patch as jest.Mock).mockResolvedValueOnce({ id: 'c-123', status: 'ACTIVE' });

      await clientApi.restoreClient('c-123', 4);

      expect(httpClient.patch).toHaveBeenCalledWith(
        '/api/v1/clients/c-123/restore',
        {},
        {
          headers: {
            'If-Match': '"4"',
          },
        },
      );
    });
  });

  describe('6. Identity Linking', () => {
    it('linkIdentity invokes POST /api/v1/clients/:id/link-identity with target identityId', async () => {
      (httpClient.post as jest.Mock).mockResolvedValueOnce({
        id: 'c-123',
        identityId: 'user-777',
      });

      await clientApi.linkIdentity('c-123', { identityId: 'user-777' });

      expect(httpClient.post).toHaveBeenCalledWith('/api/v1/clients/c-123/link-identity', {
        identityId: 'user-777',
      });
    });
  });

  describe('7. Activity Timeline', () => {
    it('getClientTimeline invokes GET /api/v1/clients/:id/timeline with pagination query', async () => {
      (httpClient.get as jest.Mock).mockResolvedValueOnce({ items: [], total: 0 });

      await clientApi.getClientTimeline('c-123', { page: 2, limit: 15 });

      expect(httpClient.get).toHaveBeenCalledWith('/api/v1/clients/c-123/timeline', {
        params: { page: 2, limit: 15 },
      });
    });
  });

  describe('8. Query Key Factory', () => {
    it('generates consistent and deterministic query keys', () => {
      expect(clientQueryKeys.all).toEqual(['clients']);
      expect(clientQueryKeys.lists()).toEqual(['clients', 'list']);
      expect(clientQueryKeys.details()).toEqual(['clients', 'detail']);
      expect(clientQueryKeys.detail('c-100')).toEqual(['clients', 'detail', 'c-100']);
      expect(clientQueryKeys.timelines()).toEqual(['clients', 'timeline']);
      expect(clientQueryKeys.timeline('c-100', { page: 1 })).toEqual([
        'clients',
        'timeline',
        'c-100',
        { page: 1 },
      ]);
    });

    it('sanitizes parameters to produce identical query keys for equivalent filters', () => {
      const keyA = clientQueryKeys.list({ page: 1, limit: 10, q: 'test', status: undefined });
      const keyB = clientQueryKeys.list({ page: 1, limit: 10, q: 'test' });

      expect(keyA).toEqual(keyB);
    });

    it('produces distinct query keys for different filter parameters', () => {
      const listA = clientQueryKeys.list({ page: 1, q: 'Alpha' });
      const listB = clientQueryKeys.list({ page: 2, q: 'Alpha' });
      const listC = clientQueryKeys.list({ page: 1, q: 'Beta' });
      const listD = clientQueryKeys.list({ status: 'ARCHIVED' });

      expect(listA).not.toEqual(listB);
      expect(listA).not.toEqual(listC);
      expect(listA).not.toEqual(listD);
    });
  });

  describe('9. Client Error Classification & Formatting', () => {
    it('identifies soft duplicate warning payload with potential matches', () => {
      const softDupPayload = {
        status: 'POTENTIAL_DUPLICATES_FOUND',
        message: 'Soft duplicate warning',
        potentialMatches: [
          {
            clientId: 'c-match',
            referenceNumber: 'CLI-01',
            fullName: 'Jane Doe',
            email: 'jane@example.com',
            phone: '+59170011111',
            matchReason: 'SIMILAR_NAME',
          },
        ],
      };

      expect(isPotentialDuplicatesWarning(softDupPayload)).toBe(true);
      expect(isHardDuplicateError(softDupPayload)).toBe(false);
      expect(formatClientErrorMessage(softDupPayload)).toMatch(
        /Potential duplicate profiles were detected/i,
      );
    });

    it('identifies HTTP 412 optimistic lock concurrency errors', () => {
      const lockError = { statusCode: 412, message: 'Version mismatch: current 2, expected 1' };

      expect(isOptimisticLockError(lockError)).toBe(true);
      expect(formatClientErrorMessage(lockError)).toMatch(/updated by another user/i);
    });

    it('identifies HTTP 422 archived client modification errors', () => {
      const archivedError = { statusCode: 422, message: 'Cannot modify archived client' };

      expect(isArchivedClientError(archivedError)).toBe(true);
      expect(formatClientErrorMessage(archivedError)).toMatch(
        /Archived client profiles cannot be modified/i,
      );
    });

    it('identifies hard duplicate conflict errors', () => {
      const hardDup = new ConflictError(
        'Client with active email jane@example.com already exists.',
      );

      expect(isHardDuplicateError(hardDup)).toBe(true);
      expect(isPotentialDuplicatesWarning(hardDup)).toBe(false);
      expect(formatClientErrorMessage(hardDup)).toBe(
        'Client with active email jane@example.com already exists.',
      );
    });

    it('identifies 404 not found errors', () => {
      const notFound = new NotFoundError('Client c-missing not found');

      expect(isNotFoundError(notFound)).toBe(true);
      expect(formatClientErrorMessage(notFound)).toMatch(/could not be found/i);
    });

    it('identifies 403 forbidden errors', () => {
      const forbidden = new AuthorizationError(
        'Only administrative staff can archive client profiles.',
      );

      expect(isForbiddenError(forbidden)).toBe(true);
      expect(formatClientErrorMessage(forbidden)).toMatch(/do not have permission/i);
    });

    it('formats validation, network, and unexpected server errors safely', () => {
      const valErr = new ValidationError('First name is required');
      expect(formatClientErrorMessage(valErr)).toBe('First name is required');

      const netErr = new NetworkError();
      expect(formatClientErrorMessage(netErr)).toMatch(/Network connection issue/i);

      const srvErr = new ServerError('Internal database crash', 500);
      expect(formatClientErrorMessage(srvErr)).toMatch(/A server error occurred/i);
    });
  });
});
