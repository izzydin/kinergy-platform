export interface RegisterClientCommandProps {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  identityId?: string | null;
  bypassSoftDuplicates?: boolean;
}

export class RegisterClientCommand {
  public readonly firstName: string;
  public readonly lastName: string;
  public readonly email: string;
  public readonly phone: string;
  public readonly identityId: string | null;
  public readonly bypassSoftDuplicates: boolean;

  constructor(props: RegisterClientCommandProps) {
    this.firstName = props.firstName;
    this.lastName = props.lastName;
    this.email = props.email;
    this.phone = props.phone;
    this.identityId = props.identityId ?? null;
    this.bypassSoftDuplicates = props.bypassSoftDuplicates ?? false;
  }
}
