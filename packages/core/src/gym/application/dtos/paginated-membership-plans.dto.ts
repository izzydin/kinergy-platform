import { MembershipPlanDTO } from './membership-plan.dto';

export interface PaginatedMembershipPlansDTO {
  items: MembershipPlanDTO[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
