import { MembershipDTO } from './membership.dto';

export interface PaginatedMembershipsDTO {
  items: MembershipDTO[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
