import { clientRegistrationSchema, normalizePhoneNumber } from '../client-registration.schema';

describe('clientRegistrationSchema Unit Spec', () => {
  describe('normalizePhoneNumber', () => {
    it('normalizes local Bolivian numbers with default country code +591', () => {
      expect(normalizePhoneNumber('70012345')).toBe('+59170012345');
      expect(normalizePhoneNumber('700-12-345')).toBe('+59170012345');
      expect(normalizePhoneNumber('(700) 12345')).toBe('+59170012345');
    });

    it('normalizes numbers starting with 00 to +', () => {
      expect(normalizePhoneNumber('0014155552671')).toBe('+14155552671');
    });

    it('preserves existing + country code numbers', () => {
      expect(normalizePhoneNumber('+14155552671')).toBe('+14155552671');
      expect(normalizePhoneNumber('+1 (415) 555-2671')).toBe('+14155552671');
      expect(normalizePhoneNumber('+591 70012345')).toBe('+59170012345');
    });

    it('returns empty string for empty input', () => {
      expect(normalizePhoneNumber('')).toBe('');
    });
  });

  describe('Validation & Parsing', () => {
    const validData = {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'Jane.Doe@Example.com',
      phone: '+14155552671',
    };

    it('accepts valid client registration payload and normalizes email to lowercase', () => {
      const parsed = clientRegistrationSchema.parse(validData);
      expect(parsed.firstName).toBe('Jane');
      expect(parsed.lastName).toBe('Doe');
      expect(parsed.email).toBe('jane.doe@example.com');
      expect(parsed.phone).toBe('+14155552671');
      expect(parsed.bypassSoftDuplicates).toBe(false);
    });

    it('accepts optional identityId', () => {
      const parsed = clientRegistrationSchema.parse({
        ...validData,
        identityId: '550e8400-e29b-41d4-a716-446655440000',
      });
      expect(parsed.identityId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('accepts empty string for identityId as optional', () => {
      const parsed = clientRegistrationSchema.parse({
        ...validData,
        identityId: '',
      });
      expect(parsed.identityId).toBe('');
    });

    it('fails when firstName is empty or only whitespace', () => {
      expect(() => clientRegistrationSchema.parse({ ...validData, firstName: '   ' })).toThrow(
        /First name is required/i,
      );
    });

    it('fails when lastName is empty or only whitespace', () => {
      expect(() => clientRegistrationSchema.parse({ ...validData, lastName: '' })).toThrow(
        /Last name is required/i,
      );
    });

    it('fails when email is invalid', () => {
      expect(() => clientRegistrationSchema.parse({ ...validData, email: 'not-an-email' })).toThrow(
        /valid email address/i,
      );
    });

    it('fails when phone number is too short or invalid', () => {
      expect(() => clientRegistrationSchema.parse({ ...validData, phone: '123' })).toThrow(
        /valid phone number/i,
      );
    });

    it('accepts local phone numbers that normalize into valid E.164 numbers', () => {
      const parsed = clientRegistrationSchema.parse({ ...validData, phone: '70012345' });
      expect(parsed.phone).toBe('70012345');
    });
  });
});
