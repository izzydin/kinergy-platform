import { ClientProfileDto } from '../dto/client-profile.dto';
import { PaginatedResultDto } from '../dto/paginated-result.dto';
import { SearchClientsQuery } from '../queries/search-clients.query';
import { ClientSearchRepository } from '../../domain/repositories/client-search.repository';
import { SearchClientsCriteria } from '../../domain/repositories/search-clients-criteria.interface';
import { ClientMapper } from '../../infrastructure/persistence/prisma/client.mapper';

export class SearchClientsUseCase {
  private static readonly MAX_LIMIT = 100;
  private static readonly DEFAULT_LIMIT = 10;
  private static readonly DEFAULT_PAGE = 1;

  private static readonly ADMIN_STAFF_ROLES = new Set([
    'ADMIN',
    'SUPER_ADMIN',
    'STAFF',
    'OWNER',
    'TRAINER',
  ]);

  private static readonly AUTHORIZED_PERMISSIONS = new Set([
    'manage:clients',
    'read:clients',
    'manage:users',
  ]);

  constructor(private readonly clientSearchRepository: ClientSearchRepository) {}

  public async execute(
    query: SearchClientsQuery = new SearchClientsQuery(),
  ): Promise<PaginatedResultDto<ClientProfileDto>> {
    // 1. Sanitize and validate pagination bounds (min 1 page, max 100 limit)
    const rawPage = query.page ?? SearchClientsUseCase.DEFAULT_PAGE;
    const rawLimit = query.limit ?? SearchClientsUseCase.DEFAULT_LIMIT;

    const page = Math.max(1, rawPage);
    const limit = Math.max(1, Math.min(SearchClientsUseCase.MAX_LIMIT, rawLimit));

    // 2. Normalize text search string
    const sanitizedQuery = query.query ? query.query.trim().replace(/\s+/g, ' ') : undefined;

    // 3. Construct domain search criteria
    const criteria: SearchClientsCriteria = {
      query: sanitizedQuery,
      status: query.status,
      includeArchived: query.includeArchived ?? false,
      createdFrom: query.createdFrom,
      createdTo: query.createdTo,
      sortBy: query.sortBy ?? 'createdAt',
      sortOrder: query.sortOrder ?? 'DESC',
      page,
      limit,
    };

    // 4. Evaluate authorization context for identity visibility
    const context = query.requestingContext;
    let includeIdentity = false;

    if (context) {
      const hasStaffRole =
        context.roles?.some((role) =>
          SearchClientsUseCase.ADMIN_STAFF_ROLES.has(role.toUpperCase()),
        ) ?? false;

      const hasStaffPermission =
        context.permissions?.some((perm) =>
          SearchClientsUseCase.AUTHORIZED_PERMISSIONS.has(perm.toLowerCase()),
        ) ?? false;

      includeIdentity = hasStaffRole || hasStaffPermission;
    }

    // 5. Query search repository abstraction
    const paginatedClients = await this.clientSearchRepository.search(criteria);

    // 6. Map aggregate items to output ClientProfileDto models
    const profileDtos = paginatedClients.items.map((client) =>
      ClientMapper.toProfileDto(client, includeIdentity),
    );

    return PaginatedResultDto.create(
      profileDtos,
      paginatedClients.total,
      paginatedClients.page,
      paginatedClients.limit,
    );
  }
}
