export interface RequestingUserContext {
  userId?: string;
  roles?: string[];
  permissions?: string[];
}

export interface GetClientProfileQueryProps {
  clientId: string;
  requestingContext?: RequestingUserContext;
}

export class GetClientProfileQuery {
  public readonly clientId: string;
  public readonly requestingContext?: RequestingUserContext;

  constructor(props: GetClientProfileQueryProps) {
    this.clientId = props.clientId;
    this.requestingContext = props.requestingContext;
  }
}
