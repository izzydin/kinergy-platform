import { Client } from '../aggregates/client.aggregate';
import { ClientStatus, NormalizedSearchName } from '../value-objects';
import { SearchClientsCriteria } from './search-clients-criteria.interface';
import { PaginatedResultDto } from '../../application/dto/paginated-result.dto';

export interface ClientSearchRepository {
  searchByName(normalizedQuery: NormalizedSearchName): Promise<Client[]>;
  searchByStatus(status: ClientStatus): Promise<Client[]>;
  search(criteria: SearchClientsCriteria): Promise<PaginatedResultDto<Client>>;
}

export const CLIENT_SEARCH_REPOSITORY = Symbol('ClientSearchRepository');
