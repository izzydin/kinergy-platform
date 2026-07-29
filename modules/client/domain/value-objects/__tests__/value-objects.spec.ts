import {
  InvalidClientNameException,
  InvalidClientReferenceException,
  InvalidEmailAddressException,
  InvalidPhoneNumberException,
} from '../../errors';
import {
  ClientId,
  ClientName,
  ClientReferenceNumber,
  ClientStatus,
  E164PhoneNumber,
  EmailAddress,
  NormalizedSearchName,
} from '../index';

describe('Client Domain Value Objects Unit Tests', () => {
  describe('ClientId', () => {
    it('should generate a valid ClientId when no ID is provided', () => {
      const id = ClientId.create();
      expect(id.value).toBeDefined();
      expect(ClientId.isValid(id.value)).toBe(true);
    });

    it('should accept a valid UUID string', () => {
      const validUuid = '9b1deb4d-3b7d-416b-9548-52ee8c8230e5';
      const id = ClientId.create(validUuid);
      expect(id.value).toBe(validUuid);
    });

    it('should reject invalid UUID strings', () => {
      expect(() => ClientId.create('invalid-uuid')).toThrow('Invalid ClientId');
    });

    it('should support value equality checks', () => {
      const uuid = '9b1deb4d-3b7d-416b-9548-52ee8c8230e5';
      const id1 = ClientId.create(uuid);
      const id2 = ClientId.create(uuid);
      const id3 = ClientId.create();

      expect(id1.equals(id2)).toBe(true);
      expect(id1.equals(id3)).toBe(false);
    });
  });

  describe('ClientReferenceNumber', () => {
    it('should create valid reference number CLI-YYYY-XXXXX', () => {
      const ref = ClientReferenceNumber.create(2026, 1);
      expect(ref.value).toBe('CLI-2026-00001');
      expect(ClientReferenceNumber.isValid(ref.value)).toBe(true);
    });

    it('should parse valid reference number from string', () => {
      const ref = ClientReferenceNumber.from('CLI-2026-00123');
      expect(ref.value).toBe('CLI-2026-00123');
    });

    it('should reject invalid reference number formats', () => {
      expect(() => ClientReferenceNumber.from('INVALID-REF')).toThrow(
        InvalidClientReferenceException,
      );
      expect(() => ClientReferenceNumber.from('CLI-2026-123')).toThrow(
        InvalidClientReferenceException,
      );
    });
  });

  describe('ClientName', () => {
    it('should trim whitespace and return full name', () => {
      const name = ClientName.create('  José  ', '  Gómez  ');
      expect(name.firstName).toBe('José');
      expect(name.lastName).toBe('Gómez');
      expect(name.fullName).toBe('José Gómez');
    });

    it('should throw InvalidClientNameException on empty first name', () => {
      expect(() => ClientName.create('   ', 'Gómez')).toThrow(InvalidClientNameException);
    });

    it('should throw InvalidClientNameException on empty last name', () => {
      expect(() => ClientName.create('José', '')).toThrow(InvalidClientNameException);
    });
  });

  describe('EmailAddress', () => {
    it('should validate, trim, and lowercase email addresses', () => {
      const email = EmailAddress.create('  User.Test@Kinergy.Com  ');
      expect(email.value).toBe('user.test@kinergy.com');
      expect(EmailAddress.isValid(email.value)).toBe(true);
    });

    it('should throw InvalidEmailAddressException on invalid email format', () => {
      expect(() => EmailAddress.create('invalid-email-address')).toThrow(
        InvalidEmailAddressException,
      );
    });
  });

  describe('E164PhoneNumber', () => {
    it('should normalize and validate raw phone numbers to E.164 format', () => {
      const phone1 = E164PhoneNumber.create('+591 7000-0000');
      expect(phone1.value).toBe('+59170000000');

      const phone2 = E164PhoneNumber.create('70000000', '591');
      expect(phone2.value).toBe('+59170000000');

      const phone3 = E164PhoneNumber.create('0059170000000');
      expect(phone3.value).toBe('+59170000000');
    });

    it('should throw InvalidPhoneNumberException on invalid phone numbers', () => {
      expect(() => E164PhoneNumber.create('abc-phone')).toThrow(InvalidPhoneNumberException);
    });
  });

  describe('NormalizedSearchName', () => {
    it('should strip diacritics and normalize casing for text search matching', () => {
      const clientName = ClientName.create('José María', 'Gómez-Nuñez');
      const normalized = NormalizedSearchName.create(clientName);

      expect(normalized.value).toBe('jose maria gomez-nunez');
    });

    it('should normalize plain string inputs', () => {
      const normalized = NormalizedSearchName.create('  Ángel   Ríos  ');
      expect(normalized.value).toBe('angel rios');
    });
  });

  describe('ClientStatus Enum', () => {
    it('should contain expected status values', () => {
      expect(ClientStatus.ACTIVE).toBe('ACTIVE');
      expect(ClientStatus.ARCHIVED).toBe('ARCHIVED');
    });
  });
});
