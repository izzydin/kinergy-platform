import { ValueObject } from '../kernel';
import { InvalidClientReferenceException } from '../errors/client-domain.exception';

export interface ClientReferenceNumberProps {
  value: string;
}

export class ClientReferenceNumber extends ValueObject<ClientReferenceNumberProps> {
  private static readonly REFERENCE_REGEX = /^CLI-\d{4}-\d{5}$/;

  private constructor(props: ClientReferenceNumberProps) {
    super(props);
  }

  public get value(): string {
    return this.props.value;
  }

  public static from(value: string): ClientReferenceNumber {
    const trimmed = (value || '').trim();
    if (!this.REFERENCE_REGEX.test(trimmed)) {
      throw new InvalidClientReferenceException(value);
    }
    return new ClientReferenceNumber({ value: trimmed });
  }

  public static create(year?: number, sequence = 1): ClientReferenceNumber {
    const currentYear = year ?? new Date().getFullYear();
    const formattedSequence = String(sequence).padStart(5, '0');
    const refString = `CLI-${currentYear}-${formattedSequence}`;
    return this.from(refString);
  }

  public static isValid(value: string): boolean {
    return this.REFERENCE_REGEX.test((value || '').trim());
  }
}
