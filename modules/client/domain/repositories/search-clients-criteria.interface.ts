import { ClientStatus } from '../value-objects/client-status.enum';

export interface SearchClientsCriteria {
  query?: string;
  status?: ClientStatus;
  includeArchived?: boolean;
  createdFrom?: Date;
  createdTo?: Date;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortOrder?: 'ASC' | 'DESC';
  page: number;
  limit: number;
}
