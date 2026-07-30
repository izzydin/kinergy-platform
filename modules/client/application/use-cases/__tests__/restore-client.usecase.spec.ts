import { Client } from '../../../domain/aggregates/client.aggregate';
import {
  ClientAlreadyActiveException,
  OptimisticLockException,
} from '../../../domain/errors/client-domain.exception';
import { ClientRepository } from '../../../domain/repositories/client.repository';
import {
  ClientName,
  ClientReferenceNumber,
  ClientStatus,
  E164PhoneNumber,
  EmailAddress,
} from '../../../domain/value-objects';
import { RestoreClientCommand } from '../../commands/restore-client.command';
import { ClientNotFoundException } from '../../exceptions/client-already-exists.exception';
import { RestoreClientUseCase } from '../restore-client.usecase';

describe('RestoreClientUseCase Unit Tests', () => {
  let useCase: RestoreClientUseCase;
  let mockClientRepository: jest.Mocked<ClientRepository>;
  let activeClient: Client;
  let archivedClient: Client;

  beforeEach(() => {
    activeClient = Client.register({
      referenceNumber: ClientReferenceNumber.create(2026, 80001),
      name: ClientName.create('Diego', 'Blanco'),
      email: EmailAddress.create('diego.blanco@example.com'),
      phone: E164PhoneNumber.create('+14155558001'),
    });

    archivedClient = Client.register({
      referenceNumber: ClientReferenceNumber.create(2026, 80002),
      name: ClientName.create('Isabel', 'Campos'),
      email: EmailAddress.create('isabel.campos@example.com'),
      phone: E164PhoneNumber.create('+14155558002'),
    });
    archivedClient.archive();

    mockClientRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockImplementation(async (id) => {
        if (id.value === activeClient.id) return activeClient;
        if (id.value === archivedClient.id) return archivedClient;
        return null;
      }),
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      findByIdentityId: jest.fn(),
      findByReferenceNumber: jest.fn(),
    };

    useCase = new RestoreClientUseCase(mockClientRepository);
  });

  it('should restore an archived client back to ACTIVE status, increment version, save aggregate, and return updated profile DTO', async () => {
    const command = new RestoreClientCommand({
      clientId: archivedClient.id,
      expectedVersion: 2,
    });

    const result = await useCase.execute(command);

    expect(result).toBeDefined();
    expect(result.status).toBe(ClientStatus.ACTIVE);
    expect(result.version).toBe(3);
    expect(mockClientRepository.save).toHaveBeenCalledWith(archivedClient);
  });

  it('should throw ClientAlreadyActiveException when restoring an active client', async () => {
    const command = new RestoreClientCommand({
      clientId: activeClient.id,
    });

    await expect(useCase.execute(command)).rejects.toThrow(ClientAlreadyActiveException);
    expect(mockClientRepository.save).not.toHaveBeenCalled();
  });

  it('should throw OptimisticLockException when expectedVersion does not match current version', async () => {
    const command = new RestoreClientCommand({
      clientId: archivedClient.id,
      expectedVersion: 99,
    });

    await expect(useCase.execute(command)).rejects.toThrow(OptimisticLockException);
    expect(mockClientRepository.save).not.toHaveBeenCalled();
  });

  it('should throw ClientNotFoundException when client ID does not exist', async () => {
    const command = new RestoreClientCommand({
      clientId: '00000000-0000-4000-8000-000000000000',
    });

    await expect(useCase.execute(command)).rejects.toThrow(ClientNotFoundException);
    expect(mockClientRepository.save).not.toHaveBeenCalled();
  });
});
