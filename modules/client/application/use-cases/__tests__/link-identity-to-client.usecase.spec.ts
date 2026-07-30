import { Client } from '../../../domain/aggregates/client.aggregate';
import { ClientAlreadyLinkedException } from '../../../domain/errors/client-domain.exception';
import { ClientRepository } from '../../../domain/repositories/client.repository';
import {
  ClientId,
  ClientName,
  ClientReferenceNumber,
  E164PhoneNumber,
  EmailAddress,
} from '../../../domain/value-objects';
import { LinkIdentityCommand } from '../../commands/link-identity.command';
import { ClientNotFoundException } from '../../exceptions/client-already-exists.exception';
import { LinkIdentityToClientUseCase } from '../link-identity-to-client.usecase';

describe('LinkIdentityToClientUseCase Unit Tests', () => {
  let mockClientRepository: jest.Mocked<ClientRepository>;
  let useCase: LinkIdentityToClientUseCase;

  const createUnlinkedClient = () => {
    return Client.register({
      id: ClientId.create('9b1deb4d-3b7d-416b-9548-52ee8c8230e5'),
      referenceNumber: ClientReferenceNumber.create(2026, 1),
      name: ClientName.create('Sofía', 'Blanco'),
      email: EmailAddress.create('sofia.blanco@kinergy.com'),
      phone: E164PhoneNumber.create('+59170000000'),
      identityId: null,
    });
  };

  beforeEach(() => {
    mockClientRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      findByIdentityId: jest.fn(),
      findByReferenceNumber: jest.fn(),
    };

    useCase = new LinkIdentityToClientUseCase(mockClientRepository);
  });

  it('should successfully link authentication credentials to an unlinked client', async () => {
    const unlinkedClient = createUnlinkedClient();
    mockClientRepository.findById.mockResolvedValue(unlinkedClient);

    const command = new LinkIdentityCommand({
      clientId: '9b1deb4d-3b7d-416b-9548-52ee8c8230e5',
      identityId: 'usr_auth_888',
    });

    const updatedClient = await useCase.execute(command);

    expect(updatedClient.identityId).toBe('usr_auth_888');
    expect(updatedClient.version).toBe(2);
    expect(mockClientRepository.save).toHaveBeenCalledTimes(1);
  });

  it('should throw ClientNotFoundException when client ID does not exist', async () => {
    mockClientRepository.findById.mockResolvedValue(null);

    const command = new LinkIdentityCommand({
      clientId: '9b1deb4d-3b7d-416b-9548-52ee8c8230e5',
      identityId: 'usr_auth_888',
    });

    await expect(useCase.execute(command)).rejects.toThrow(ClientNotFoundException);
    expect(mockClientRepository.save).not.toHaveBeenCalled();
  });

  it('should throw ClientAlreadyLinkedException when client is already linked to an identity', async () => {
    const linkedClient = createUnlinkedClient();
    linkedClient.linkIdentity('usr_auth_existing');
    mockClientRepository.findById.mockResolvedValue(linkedClient);

    const command = new LinkIdentityCommand({
      clientId: '9b1deb4d-3b7d-416b-9548-52ee8c8230e5',
      identityId: 'usr_auth_new',
    });

    await expect(useCase.execute(command)).rejects.toThrow(ClientAlreadyLinkedException);
  });
});
