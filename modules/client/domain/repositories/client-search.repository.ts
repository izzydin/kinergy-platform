import { Client } from '../aggregates/client.aggregate';
import { ClientStatus, NormalizedSearchName } from '../value-objects';

export interface ClientSearchRepository {
  searchByName(normalizedQuery: NormalizedSearchName): Promise<Client[]>;
  searchByStatus(status: ClientStatus): Promise<Client[]>;
}

export const CLIENT_SEARCH_REPOSITORY = Symbol('ClientSearchRepository');
