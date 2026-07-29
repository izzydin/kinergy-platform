import { ValueObject } from '../kernel';
import { InvalidPhoneNumberException } from '../errors/client-domain.exception';

export interface E164PhoneNumberProps {
  value: string;
}

export class E164PhoneNumber extends ValueObject<E164PhoneNumberProps> {
  // Standard E.164 format: + followed by 8 to 15 digits starting with non-zero
  private static readonly E164_REGEX = /^\+[1-9]\d{7,14}$/;

  private constructor(props: E164PhoneNumberProps) {
    super(props);
  }

  public get value(): string {
    return this.props.value;
  }

  public static create(phone: string, defaultCountryCode = '591'): E164PhoneNumber {
    const raw = (phone || '').trim();

    if (!raw) {
      throw new InvalidPhoneNumberException(phone);
    }

    const normalized = this.normalize(raw, defaultCountryCode);

    if (!this.E164_REGEX.test(normalized)) {
      throw new InvalidPhoneNumberException(phone);
    }

    return new E164PhoneNumber({ value: normalized });
  }

  public static normalize(phone: string, defaultCountryCode = '591'): string {
    let cleaned = phone.trim().replace(/[\s().-]/g, '');

    if (cleaned.startsWith('00')) {
      cleaned = '+' + cleaned.substring(2);
    } else if (!cleaned.startsWith('+')) {
      // If starts with digits, check if it already has country code or needs default
      if (cleaned.length <= 8 && defaultCountryCode) {
        cleaned = '+' + defaultCountryCode + cleaned;
      } else {
        cleaned = '+' + cleaned;
      }
    }

    return cleaned;
  }

  public static isValid(phone: string, defaultCountryCode = '591'): boolean {
    try {
      const normalized = this.normalize(phone, defaultCountryCode);
      return this.E164_REGEX.test(normalized);
    } catch {
      return false;
    }
  }
}
