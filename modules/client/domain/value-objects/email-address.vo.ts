import { ValueObject } from '../kernel';
import { InvalidEmailAddressException } from '../errors/client-domain.exception';

export interface EmailAddressProps {
  value: string;
}

export class EmailAddress extends ValueObject<EmailAddressProps> {
  private static readonly EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  private constructor(props: EmailAddressProps) {
    super(props);
  }

  public get value(): string {
    return this.props.value;
  }

  public static create(email: string): EmailAddress {
    const trimmed = (email || '').trim().toLowerCase();

    if (!trimmed || !this.EMAIL_REGEX.test(trimmed)) {
      throw new InvalidEmailAddressException(email);
    }

    return new EmailAddress({ value: trimmed });
  }

  public static isValid(email: string): boolean {
    const trimmed = (email || '').trim().toLowerCase();
    return this.EMAIL_REGEX.test(trimmed);
  }
}
