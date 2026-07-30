import { Client } from '../../../domain/aggregates/client.aggregate';
import {
  ClientAlreadyArchivedException,
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
import { ArchiveClientCommand } from '../../commands/archive-client.command';
import { ClientNotFoundException } from '../../exceptions/client-already-exists.exception';
import { ArchiveClientUseCase } from '../archive-client.usecase';

describe('ArchiveClientUseCase Unit Tests', () => {
  let useCase: ArchiveClientUseCase;
  let mockClientRepository: jest.Mocked<ClientRepository>;
  let activeClient: Client;
  let archivedClient: Client;

  beforeEach(() => {
    activeClient = Client.register({
      referenceNumber: ClientReferenceNumber.create(2026, 70001),
      name: ClientName.create('Carlos', 'Vega'),
      email: EmailAddress.create('carlos.vega@example.com'),
      phone: E164PhoneNumber.create('+14155557001'),
    });

    archivedClient = Client.register({
      referenceNumber: ClientReferenceNumber.create(2026, 70002),
      name: ClientName.create('Sofia', 'Nunez'),
      email: EmailAddress.create('sofia.nunez@example.com'),
      phone: E164PhoneNumber.create('+14155557002'),
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

    useCase = new ArchiveClientUseCase(mockClientRepository);
  });

  it('should archive an active client, increment version, save aggregate, and return updated profile DTO', async () => {
    const command = new ArchiveClientCommand({
      clientId: activeClient.id,
      expectedVersion: 1,
    });

    const result = await useCase.execute(command);

    expect(result).toBeDefined();
    expect(result.status).toBe(ClientStatus.ARCHIVED);
    expect(result.version).toBe(2);
    expect(mockClientRepository.save).toHaveBeenCalledWith(activeClient);
  });

  it('should throw ClientAlreadyArchivedException when archiving an already archived client', async () => {
    const command = new ArchiveClientCommand({
      clientId: archivedClient.id,
    });

    await expect(useCase.execute(command)).rejects.toThrow(ClientAlreadyArchivedException);
    expect(mockClientRepository.save).not.toHaveBeenCalled();
  });

  it('should throw OptimisticLockException when expectedVersion does not match current version', async () => {
    const command = new ArchiveClientCommand({
      clientId: activeClient.id,
      expectedVersion: 99,
    });

    await expect(useCase.execute(command)).rejects.toThrow(OptimisticLockException);
    expect(mockClientRepository.save).not.toHaveBeenCalled();
  });

  it('should throw ClientNotFoundException when client ID does not exist', async () => {
    const command = new ArchiveClientCommand({
      clientId: '00000000-0000-4000-8000-000000000000',
    });

    await expect(useCase.execute(command)).rejects.toThrow(ClientNotFoundException);
    expect(mockClientRepository.save).not.toHaveBeenCalled();
  });
});
