import { Client } from '../domain/aggregates/client.aggregate';
import {
  ClientName,
  ClientReferenceNumber,
  E164PhoneNumber,
  EmailAddress,
} from '../domain/value-objects';
import { ClientMapper } from '../infrastructure/persistence/prisma/client.mapper';
import { GetClientProfileUseCase } from '../application/use-cases/get-client-profile.usecase';
import { SearchClientsUseCase } from '../application/use-cases/search-clients.usecase';
import { ClientNotFoundException } from '../application/exceptions/client-already-exists.exception';
import { ClientProfileDto } from '../application/dto/client-profile.dto';
import { PaginatedResultDto } from '../application/dto/paginated-result.dto';
import { ClientFacade } from '../public/client.facade';
import { ClientSummaryDto } from '../public/dto/client-summary.dto';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeActiveClient(): Client {
  return Client.register({
    referenceNumber: ClientReferenceNumber.create(2026, 10001),
    name: ClientName.create('Ana', 'García'),
    email: EmailAddress.create('ana.garcia@example.com'),
    phone: E164PhoneNumber.create('+14155550101'),
  });
}

function makeArchivedClient(): Client {
  const c = Client.register({
    referenceNumber: ClientReferenceNumber.create(2026, 10002),
    name: ClientName.create('Ben', 'Hart'),
    email: EmailAddress.create('ben.hart@example.com'),
    phone: E164PhoneNumber.create('+14155550102'),
  });
  c.archive();
  return c;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ClientFacade', () => {
  let facade: ClientFacade;
  let mockGetProfile: jest.Mocked<GetClientProfileUseCase>;
  let mockSearch: jest.Mocked<SearchClientsUseCase>;
  let activeClient: Client;
  let archivedClient: Client;
  let activeProfileDto: ClientProfileDto;
  let archivedProfileDto: ClientProfileDto;

  beforeEach(() => {
    activeClient = makeActiveClient();
    archivedClient = makeArchivedClient();
    activeProfileDto = ClientMapper.toProfileDto(activeClient, false);
    archivedProfileDto = ClientMapper.toProfileDto(archivedClient, false);

    mockGetProfile = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetClientProfileUseCase>;

    mockSearch = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<SearchClientsUseCase>;

    facade = new ClientFacade(mockGetProfile, mockSearch);
  });

  // -------------------------------------------------------------------------
  // getClientProfile
  // -------------------------------------------------------------------------
  describe('getClientProfile', () => {
    it('should return ClientProfileDto when the client exists', async () => {
      mockGetProfile.execute.mockResolvedValueOnce(activeProfileDto);

      const result = await facade.getClientProfile(activeClient.id);

      expect(result).not.toBeNull();
      expect(result?.id).toBe(activeClient.id);
      expect(result?.fullName).toBe('Ana García');
      expect(result?.email).toBe('ana.garcia@example.com');
      expect(result?.status).toBe('ACTIVE');
    });

    it('should return null when the client is not found (swallows ClientNotFoundException)', async () => {
      mockGetProfile.execute.mockRejectedValueOnce(
        new ClientNotFoundException('00000000-0000-4000-8000-000000000000'),
      );

      const result = await facade.getClientProfile('00000000-0000-4000-8000-000000000000');

      expect(result).toBeNull();
    });

    it('should re-throw unexpected errors without swallowing them', async () => {
      const unexpected = new Error('DB connection lost');
      mockGetProfile.execute.mockRejectedValueOnce(unexpected);

      await expect(facade.getClientProfile(activeClient.id)).rejects.toThrow('DB connection lost');
    });
  });

  // -------------------------------------------------------------------------
  // getClientSummary
  // -------------------------------------------------------------------------
  describe('getClientSummary', () => {
    it('should return a trimmed ClientSummaryDto when the client exists', async () => {
      mockGetProfile.execute.mockResolvedValueOnce(activeProfileDto);

      const result = await facade.getClientSummary(activeClient.id);

      expect(result).not.toBeNull();
      expect(result).toBeInstanceOf(ClientSummaryDto);
      expect(result?.id).toBe(activeClient.id);
      expect(result?.referenceNumber).toBe('CLI-2026-10001');
      expect(result?.fullName).toBe('Ana García');
      expect(result?.email).toBe('ana.garcia@example.com');
      expect(result?.phone).toBe('+14155550101');
      expect(result?.status).toBe('ACTIVE');
    });

    it('should return null when the client is not found', async () => {
      mockGetProfile.execute.mockRejectedValueOnce(
        new ClientNotFoundException('00000000-0000-4000-8000-000000000000'),
      );

      const result = await facade.getClientSummary('00000000-0000-4000-8000-000000000000');

      expect(result).toBeNull();
    });

    it('should not expose identityId or internal fields on the summary DTO', async () => {
      mockGetProfile.execute.mockResolvedValueOnce(activeProfileDto);

      const result = await facade.getClientSummary(activeClient.id);

      expect(result).not.toBeNull();
      expect((result as unknown as Record<string, unknown>)['identityId']).toBeUndefined();
      expect((result as unknown as Record<string, unknown>)['version']).toBeUndefined();
      expect((result as unknown as Record<string, unknown>)['createdAt']).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // isClientActive
  // -------------------------------------------------------------------------
  describe('isClientActive', () => {
    it('should return true for an ACTIVE client', async () => {
      mockGetProfile.execute.mockResolvedValueOnce(activeProfileDto);

      const result = await facade.isClientActive(activeClient.id);

      expect(result).toBe(true);
    });

    it('should return false for an ARCHIVED client', async () => {
      mockGetProfile.execute.mockResolvedValueOnce(archivedProfileDto);

      const result = await facade.isClientActive(archivedClient.id);

      expect(result).toBe(false);
    });

    it('should return false when the client does not exist', async () => {
      mockGetProfile.execute.mockRejectedValueOnce(
        new ClientNotFoundException('00000000-0000-4000-8000-000000000000'),
      );

      const result = await facade.isClientActive('00000000-0000-4000-8000-000000000000');

      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // searchClientsSummary
  // -------------------------------------------------------------------------
  describe('searchClientsSummary', () => {
    it('should return an array of ClientSummaryDto matching the search', async () => {
      const paginated = PaginatedResultDto.create([activeProfileDto], 1, 1, 10);
      mockSearch.execute.mockResolvedValueOnce(paginated);

      const results = await facade.searchClientsSummary('Ana', 10);

      expect(results).toHaveLength(1);
      expect(results[0]).toBeInstanceOf(ClientSummaryDto);
      expect(results[0]!.fullName).toBe('Ana García');
    });

    it('should return an empty array when no clients match', async () => {
      const paginated = PaginatedResultDto.create([], 0, 1, 10);
      mockSearch.execute.mockResolvedValueOnce(paginated);

      const results = await facade.searchClientsSummary('nonexistent');

      expect(results).toEqual([]);
    });

    it('should pass query and limit to the underlying SearchClientsUseCase', async () => {
      const paginated = PaginatedResultDto.create([], 0, 1, 5);
      mockSearch.execute.mockResolvedValueOnce(paginated);

      await facade.searchClientsSummary('  García  ', 5);

      expect(mockSearch.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'García',
          limit: 5,
          page: 1,
          includeArchived: false,
        }),
      );
    });
  });
});
