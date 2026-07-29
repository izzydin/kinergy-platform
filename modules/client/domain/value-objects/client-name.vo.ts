import { ValueObject } from '../kernel';
import { InvalidClientNameException } from '../errors/client-domain.exception';

export interface ClientNameProps {
  firstName: string;
  lastName: string;
}

export class ClientName extends ValueObject<ClientNameProps> {
  private constructor(props: ClientNameProps) {
    super(props);
  }

  public get firstName(): string {
    return this.props.firstName;
  }

  public get lastName(): string {
    return this.props.lastName;
  }

  public get fullName(): string {
    return `${this.props.firstName} ${this.props.lastName}`;
  }

  public static create(firstName: string, lastName: string): ClientName {
    const trimmedFirstName = (firstName || '').trim();
    const trimmedLastName = (lastName || '').trim();

    if (!trimmedFirstName) {
      throw new InvalidClientNameException('First name cannot be empty.');
    }

    if (!trimmedLastName) {
      throw new InvalidClientNameException('Last name cannot be empty.');
    }

    return new ClientName({
      firstName: trimmedFirstName,
      lastName: trimmedLastName,
    });
  }
}
