export interface GetClientHistoryQueryProps {
  clientId: string;
  page?: number;
  limit?: number;
}

export class GetClientHistoryQuery {
  public readonly clientId: string;
  public readonly page: number;
  public readonly limit: number;

  constructor(props: GetClientHistoryQueryProps) {
    this.clientId = props.clientId;
    this.page = Math.max(1, props.page ?? 1);
    this.limit = Math.min(100, Math.max(1, props.limit ?? 20));
  }
}
