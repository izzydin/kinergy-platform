import { ClientStatus } from '../../domain/value-objects/client-status.enum';
import { RequestingUserContext } from './get-client-profile.query';

export interface SearchClientsQueryProps {
  query?: string;
  status?: ClientStatus;
  includeArchived?: boolean;
  createdFrom?: Date;
  createdTo?: Date;
  sortBy?: 'name' | 'createdAt' | 'updatedAt';
  sortOrder?: 'ASC' | 'DESC';
  page?: number;
  limit?: number;
  requestingContext?: RequestingUserContext;
}

export class SearchClientsQuery {
  public readonly query?: string;
  public readonly status?: ClientStatus;
  public readonly includeArchived?: boolean;
  public readonly createdFrom?: Date;
  public readonly createdTo?: Date;
  public readonly sortBy?: 'name' | 'createdAt' | 'updatedAt';
  public readonly sortOrder?: 'ASC' | 'DESC';
  public readonly page?: number;
  public readonly limit?: number;
  public readonly requestingContext?: RequestingUserContext;

  constructor(props: SearchClientsQueryProps = {}) {
    this.query = props.query;
    this.status = props.status;
    this.includeArchived = props.includeArchived;
    this.createdFrom = props.createdFrom;
    this.createdTo = props.createdTo;
    this.sortBy = props.sortBy;
    this.sortOrder = props.sortOrder;
    this.page = props.page;
    this.limit = props.limit;
    this.requestingContext = props.requestingContext;
  }
}
