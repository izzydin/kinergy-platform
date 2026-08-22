import { AssignedClientMembershipDTO } from './assigned-client-membership.dto';

/**
 * Paginated envelope for assigned client memberships read model (Phase 5.6-D).
 */
export interface PaginatedAssignedClientsDTO {
  readonly items: AssignedClientMembershipDTO[];
  readonly totalItems: number;
  readonly page: number;
  readonly limit: number;
  readonly totalPages: number;
  readonly hasNextPage: boolean;
  readonly hasPreviousPage: boolean;
}
