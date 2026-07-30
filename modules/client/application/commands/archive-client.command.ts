export interface ArchiveClientCommandProps {
  clientId: string;
  expectedVersion?: number;
}

export class ArchiveClientCommand {
  public readonly clientId: string;
  public readonly expectedVersion?: number;

  constructor(props: ArchiveClientCommandProps) {
    this.clientId = props.clientId;
    this.expectedVersion = props.expectedVersion;
  }
}
