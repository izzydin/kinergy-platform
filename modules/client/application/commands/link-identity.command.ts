export interface LinkIdentityCommandProps {
  clientId: string;
  identityId: string;
}

export class LinkIdentityCommand {
  public readonly clientId: string;
  public readonly identityId: string;

  constructor(props: LinkIdentityCommandProps) {
    this.clientId = props.clientId;
    this.identityId = props.identityId;
  }
}
