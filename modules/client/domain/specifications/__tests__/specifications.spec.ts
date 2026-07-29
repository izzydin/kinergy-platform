import { Client, RegisterClientProps } from '../../aggregates/client.aggregate';
import {
  ClientId,
  ClientName,
  ClientReferenceNumber,
  E164PhoneNumber,
  EmailAddress,
} from '../../value-objects';
import {
  CanArchiveClientSpecification,
  CanRegisterClientSpecification,
  ClientAlreadyLinkedSpecification,
} from '../index';

describe('Client Domain Specifications Unit Tests', () => {
  const createSampleRegisterProps = () => ({
    id: ClientId.create(),
    referenceNumber: ClientReferenceNumber.create(2026, 10),
    name: ClientName.create('Carlos', 'Siles'),
    email: EmailAddress.create('carlos.siles@kinergy.com'),
    phone: E164PhoneNumber.create('+59170000000'),
    identityId: null,
  });

  describe('CanRegisterClientSpecification', () => {
    it('should return true for valid client registration props', () => {
      const spec = new CanRegisterClientSpecification();
      expect(spec.isSatisfiedBy(createSampleRegisterProps())).toBe(true);
    });

    it('should return false if props or required fields are missing', () => {
      const spec = new CanRegisterClientSpecification();
      expect(spec.isSatisfiedBy(null as unknown as RegisterClientProps)).toBe(false);
      expect(spec.isSatisfiedBy({} as unknown as RegisterClientProps)).toBe(false);
    });
  });

  describe('ClientAlreadyLinkedSpecification', () => {
    it('should return false when client identityId is null', () => {
      const client = Client.register(createSampleRegisterProps());
      const spec = new ClientAlreadyLinkedSpecification();

      expect(spec.isSatisfiedBy(client)).toBe(false);
    });

    it('should return true when client has linked identityId', () => {
      const client = Client.register(createSampleRegisterProps());
      client.linkIdentity('usr_auth_1001');
      const spec = new ClientAlreadyLinkedSpecification();

      expect(spec.isSatisfiedBy(client)).toBe(true);
    });
  });

  describe('CanArchiveClientSpecification', () => {
    it('should return true when client status is ACTIVE', () => {
      const client = Client.register(createSampleRegisterProps());
      const spec = new CanArchiveClientSpecification();

      expect(spec.isSatisfiedBy(client)).toBe(true);
    });

    it('should return false when client is already ARCHIVED', () => {
      const client = Client.register(createSampleRegisterProps());
      client.archive();
      const spec = new CanArchiveClientSpecification();

      expect(spec.isSatisfiedBy(client)).toBe(false);
    });
  });
});
