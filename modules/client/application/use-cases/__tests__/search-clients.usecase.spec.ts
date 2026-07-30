import { Client } from '../../../domain/aggregates/client.aggregate';
import { ClientSearchRepository } from '../../../domain/repositories/client-search.repository';
import { SearchClientsCriteria } from '../../../domain/repositories/search-clients-criteria.interface';
import {
  ClientName,
  ClientReferenceNumber,
  ClientStatus,
  E164PhoneNumber,
  EmailAddress,
} from '../../../domain/value-objects';
import { PaginatedResultDto } from '../../dto/paginated-result.dto';
import { SearchClientsQuery } from '../../queries/search-clients.query';
import { SearchClientsUseCase } from '../search-clients.usecase';

describe('SearchClientsUseCase Unit Tests', () => {
  let useCase: SearchClientsUseCase;
  let mockSearchRepository: jest.Mocked<ClientSearchRepository>;
  let sampleClient1: Client;
  let sampleClient2: Client;

  beforeEach(() => {
    sampleClient1 = Client.register({
      referenceNumber: ClientReferenceNumber.create(2026, 10001),
      name: ClientName.create('Carlos', 'Valderrama'),
      email: EmailAddress.create('carlos@example.com'),
      phone: E164PhoneNumber.create('+14155551001'),
      identityId: 'user-identity-1001',
    });

    sampleClient2 = Client.register({
      referenceNumber: ClientReferenceNumber.create(2026, 10002),
      name: ClientName.create('James', 'Rodriguez'),
      email: EmailAddress.create('james@example.com'),
      phone: E164PhoneNumber.create('+14155551002'),
    });

    mockSearchRepository = {
      searchByName: jest.fn(),
      searchByStatus: jest.fn(),
      search: jest.fn().mockImplementation(async (criteria: SearchClientsCriteria) => {
        const items = [sampleClient1, sampleClient2];
        return PaginatedResultDto.create(items, 2, criteria.page, criteria.limit);
      }),
    };

    useCase = new SearchClientsUseCase(mockSearchRepository);
  });

  it('should execute search with default pagination, sorting, and includeArchived=false', async () => {
    const query = new SearchClientsQuery();
    const result = await useCase.execute(query);

    expect(result).toBeDefined();
    expect(result.items).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(10);
    expect(result.totalPages).toBe(1);
    expect(result.hasNextPage).toBe(false);
    expect(result.hasPreviousPage).toBe(false);

    expect(mockSearchRepository.search).toHaveBeenCalledWith({
      query: undefined,
      status: undefined,
      includeArchived: false,
      createdFrom: undefined,
      createdTo: undefined,
      sortBy: 'createdAt',
      sortOrder: 'DESC',
      page: 1,
      limit: 10,
    });
  });

  it('should enforce safety caps on max limit (limit 500 -> 100) and page floor (page -2 -> 1)', async () => {
    const query = new SearchClientsQuery({
      page: -2,
      limit: 500,
    });

    await useCase.execute(query);

    expect(mockSearchRepository.search).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        limit: 100,
      }),
    );
  });

  it('should sanitize search query text and pass criteria filters correctly', async () => {
    const fromDate = new Date('2026-01-01');
    const toDate = new Date('2026-12-31');

    const query = new SearchClientsQuery({
      query: '  carlos  valderrama   ',
      status: ClientStatus.ACTIVE,
      includeArchived: true,
      createdFrom: fromDate,
      createdTo: toDate,
      sortBy: 'name',
      sortOrder: 'ASC',
      page: 2,
      limit: 15,
    });

    await useCase.execute(query);

    expect(mockSearchRepository.search).toHaveBeenCalledWith({
      query: 'carlos valderrama',
      status: ClientStatus.ACTIVE,
      includeArchived: true,
      createdFrom: fromDate,
      createdTo: toDate,
      sortBy: 'name',
      sortOrder: 'ASC',
      page: 2,
      limit: 15,
    });
  });

  it('should map Client aggregates to ClientProfileDto results omitting identityId for non-staff requester', async () => {
    const query = new SearchClientsQuery({
      requestingContext: {
        userId: 'regular-user',
        roles: ['USER'],
      },
    });

    const result = await useCase.execute(query);

    expect(result.items[0]?.fullName).toBe('Carlos Valderrama');
    expect(result.items[0]?.identityId).toBeNull();
  });

  it('should include identityId in ClientProfileDto results when requester has ADMIN staff role', async () => {
    const query = new SearchClientsQuery({
      requestingContext: {
        userId: 'admin-user',
        roles: ['ADMIN'],
      },
    });

    const result = await useCase.execute(query);

    expect(result.items[0]?.identityId).toBe('user-identity-1001');
  });
});
