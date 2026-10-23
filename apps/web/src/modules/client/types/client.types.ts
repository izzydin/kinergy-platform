import type { OnChangeFn, SortingState } from '@tanstack/react-table';

export type ClientStatus = 'ACTIVE' | 'ARCHIVED';
export const VALID_CLIENT_STATUSES: readonly ClientStatus[] = ['ACTIVE', 'ARCHIVED'] as const;

export type ClientSortField = 'name' | 'createdAt' | 'updatedAt';
export type ClientSortDirection = 'asc' | 'desc';
export type ClientSortDirectionUpper = 'ASC' | 'DESC';

/**
 * Authoritative Client Model matching backend ClientProfileDto
 * @see modules/client/application/dto/client-profile.dto.ts
 */
export interface ClientModel {
  id: string;
  referenceNumber: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  status: ClientStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  identityId: string | null;
}

/**
 * Server-side Paginated Client Collection DTO
 * @see modules/client/application/dto/paginated-result.dto.ts
 */
export interface PaginatedClientsDTO {
  items: ClientModel[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

/**
 * Clean search query parameters matching backend SearchClientsQueryDto
 * @see modules/client/presentation/dto/search-clients-query.dto.ts
 */
export interface SearchClientsQueryParams {
  query?: string;
  q?: string;
  status?: ClientStatus;
  includeArchived?: boolean;
  createdFrom?: string;
  createdTo?: string;
  sortBy?: ClientSortField;
  sortOrder?: ClientSortDirectionUpper;
  sort?: string;
  page?: number;
  limit?: number;
}

/**
 * Client registration payload matching backend RegisterClientRequestDto
 * @see modules/client/presentation/dto/register-client.dto.ts
 */
export interface RegisterClientInputDTO {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  identityId?: string;
  bypassSoftDuplicates?: boolean;
}

/**
 * Response returned upon successful client registration
 * @see modules/client/presentation/dto/client-response.dto.ts
 */
export interface RegisterClientResponseDTO {
  id: string;
  referenceNumber: string;
  identityId: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Potential duplicate match item in soft-duplicate conflict response
 * @see modules/client/presentation/dto/potential-matches-response.dto.ts
 */
export interface PotentialMatchDTO {
  clientId: string;
  referenceNumber: string;
  fullName: string;
  email: string;
  phone: string;
  matchReason: 'EXACT_PHONE' | 'SIMILAR_NAME' | 'SIMILAR_PHONE';
}

/**
 * 409 Conflict payload returned when soft duplicates are detected
 * @see modules/client/presentation/dto/potential-matches-response.dto.ts
 */
export interface PotentialMatchesWarningDTO {
  status: 'POTENTIAL_DUPLICATES_FOUND';
  message: string;
  potentialMatches: PotentialMatchDTO[];
}

/**
 * Update client payload matching backend UpdateClientRequestDto
 * @see modules/client/presentation/dto/update-client-request.dto.ts
 */
export interface UpdateClientInputDTO {
  expectedVersion: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

/**
 * Link identity payload matching backend LinkIdentityRequestDto
 * @see modules/client/presentation/dto/link-identity.dto.ts
 */
export interface LinkIdentityInputDTO {
  identityId: string;
}

/**
 * Typed URL filter state used by useTableUrlState hook
 */
export interface ClientFilters {
  status?: ClientStatus;
  includeArchived?: boolean;
  createdFrom?: string;
  createdTo?: string;
}

/**
 * Return contract for useClientFilters hook
 */
export interface UseClientFiltersReturn {
  params: SearchClientsQueryParams;
  q: string;
  page: number;
  limit: number;
  sort: string;
  sortField: ClientSortField;
  sortDirection: ClientSortDirection;
  sortState: SortingState;
  filters: ClientFilters;
  isFiltered: boolean;
  setSearch: (term: string, options?: { immediate?: boolean }) => void;
  setPage: (page: number) => void;
  setLimit: (limit: number) => void;
  setSort: (sort?: string) => void;
  handleSortingChange: OnChangeFn<SortingState>;
  setStatus: (status?: ClientStatus) => void;
  setIncludeArchived: (include?: boolean) => void;
  setDateRange: (createdFrom?: string, createdTo?: string) => void;
  resetFilters: () => void;
}
