import { Client } from '../../../domain/aggregates/client.aggregate';
import { ClientRepository } from '../../../domain/repositories/client.repository';
import {
  ClientName,
  ClientReferenceNumber,
  E164PhoneNumber,
  EmailAddress,
} from '../../../domain/value-objects';
import { ClientNotFoundException } from '../../exceptions/client-already-exists.exception';
import { GetClientProfileQuery } from '../../queries/get-client-profile.query';
import { GetClientProfileUseCase } from '../get-client-profile.usecase';

describe('GetClientProfileUseCase Unit Tests', () => {
  let useCase: GetClientProfileUseCase;
  let mockClientRepository: jest.Mocked<ClientRepository>;
  let existingClient: Client;

  beforeEach(() => {
    existingClient = Client.register({
      referenceNumber: ClientReferenceNumber.create(2026, 77777),
      name: ClientName.create('Isabella', 'Rossi'),
      email: EmailAddress.create('isabella.rossi@example.com'),
      phone: E164PhoneNumber.create('+14155557777'),
      identityId: 'linked-user-identity-id-777',
    });

    mockClientRepository = {
      save: jest.fn(),
      findById: jest.fn().mockImplementation(async (id) => {
        if (id.value === existingClient.id) return existingClient;
        return null;
      }),
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      findByIdentityId: jest.fn(),
      findByReferenceNumber: jest.fn(),
    };

    useCase = new GetClientProfileUseCase(mockClientRepository);
  });

  it('should return ClientProfileDto for an existing client', async () => {
    const query = new GetClientProfileQuery({ clientId: existingClient.id });
    const result = await useCase.execute(query);

    expect(result).toBeDefined();
    expect(result.id).toBe(existingClient.id);
    expect(result.referenceNumber).toBe('CLI-2026-77777');
    expect(result.fullName).toBe('Isabella Rossi');
    expect(result.email).toBe('isabella.rossi@example.com');
  });

  it('should throw ClientNotFoundException when client ID does not exist', async () => {
    const nonExistentId = '00000000-0000-4000-8000-000000000000';
    const query = new GetClientProfileQuery({ clientId: nonExistentId });

    await expect(useCase.execute(query)).rejects.toThrow(ClientNotFoundException);
  });

  it('should include identityId when requested by an ADMIN role', async () => {
    const query = new GetClientProfileQuery({
      clientId: existingClient.id,
      requestingContext: {
        userId: 'admin-user-id',
        roles: ['ADMIN'],
        permissions: [],
      },
    });

    const result = await useCase.execute(query);
    expect(result.identityId).toBe('linked-user-identity-id-777');
  });

  it('should include identityId when requested by the self-linked client user', async () => {
    const query = new GetClientProfileQuery({
      clientId: existingClient.id,
      requestingContext: {
        userId: 'linked-user-identity-id-777',
        roles: ['USER'],
        permissions: [],
      },
    });

    const result = await useCase.execute(query);
    expect(result.identityId).toBe('linked-user-identity-id-777');
  });

  it('should omit identityId (return null) when requested by a non-staff user who is not self', async () => {
    const query = new GetClientProfileQuery({
      clientId: existingClient.id,
      requestingContext: {
        userId: 'other-user-id-123',
        roles: ['USER'],
        permissions: [],
      },
    });

    const result = await useCase.execute(query);
    expect(result.identityId).toBeNull();
  });
});
