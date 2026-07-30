export interface RestoreClientCommandProps {
  clientId: string;
  expectedVersion?: number;
}

export class RestoreClientCommand {
  public readonly clientId: string;
  public readonly expectedVersion?: number;

  constructor(props: RestoreClientCommandProps) {
    this.clientId = props.clientId;
    this.expectedVersion = props.expectedVersion;
  }
}
