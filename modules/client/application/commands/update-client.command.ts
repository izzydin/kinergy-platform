export interface UpdateClientCommandProps {
  clientId: string;
  expectedVersion: number;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
}

export class UpdateClientCommand {
  public readonly clientId: string;
  public readonly expectedVersion: number;
  public readonly firstName?: string;
  public readonly lastName?: string;
  public readonly email?: string;
  public readonly phone?: string;

  constructor(props: UpdateClientCommandProps) {
    this.clientId = props.clientId;
    this.expectedVersion = props.expectedVersion;
    this.firstName = props.firstName;
    this.lastName = props.lastName;
    this.email = props.email;
    this.phone = props.phone;
  }
}
