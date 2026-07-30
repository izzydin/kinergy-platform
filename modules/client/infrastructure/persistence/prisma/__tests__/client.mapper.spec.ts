import { Client } from '../../../../domain/aggregates/client.aggregate';
import {
  ClientName,
  ClientReferenceNumber,
  ClientStatus,
  E164PhoneNumber,
  EmailAddress,
} from '../../../../domain/value-objects';
import { ClientMapper } from '../client.mapper';

describe('ClientMapper Unit Tests', () => {
  let client: Client;

  beforeEach(() => {
    client = Client.register({
      referenceNumber: ClientReferenceNumber.create(2026, 12345),
      name: ClientName.create('Sophia', 'Loren'),
      email: EmailAddress.create('sophia.loren@example.com'),
      phone: E164PhoneNumber.create('+14155551234'),
      identityId: 'user-identity-uuid-999',
    });
  });

  describe('toProfileDto', () => {
    it('should map Client aggregate to ClientProfileDto and omit identityId when includeIdentity is false', () => {
      const dto = ClientMapper.toProfileDto(client, false);

      expect(dto).toBeDefined();
      expect(dto.id).toBe(client.id);
      expect(dto.referenceNumber).toBe('CLI-2026-12345');
      expect(dto.firstName).toBe('Sophia');
      expect(dto.lastName).toBe('Loren');
      expect(dto.fullName).toBe('Sophia Loren');
      expect(dto.email).toBe('sophia.loren@example.com');
      expect(dto.phone).toBe('+14155551234');
      expect(dto.status).toBe(ClientStatus.ACTIVE);
      expect(dto.version).toBe(1);
      expect(dto.createdAt).toEqual(client.createdAt);
      expect(dto.updatedAt).toEqual(client.updatedAt);
      expect(dto.identityId).toBeNull();
    });

    it('should include identityId in ClientProfileDto when includeIdentity is true', () => {
      const dto = ClientMapper.toProfileDto(client, true);

      expect(dto).toBeDefined();
      expect(dto.id).toBe(client.id);
      expect(dto.identityId).toBe('user-identity-uuid-999');
    });

    it('should return null for identityId when includeIdentity is true but client has no linked identity', () => {
      const unlinkedClient = Client.register({
        referenceNumber: ClientReferenceNumber.create(2026, 54321),
        name: ClientName.create('Lucas', 'Vazquez'),
        email: EmailAddress.create('lucas.vazquez@example.com'),
        phone: E164PhoneNumber.create('+14155554321'),
      });

      const dto = ClientMapper.toProfileDto(unlinkedClient, true);

      expect(dto.identityId).toBeNull();
    });
  });
});
