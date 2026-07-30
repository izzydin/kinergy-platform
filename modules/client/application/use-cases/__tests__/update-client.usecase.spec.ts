import { Client } from '../../../domain/aggregates/client.aggregate';
import { OptimisticLockException } from '../../../domain/errors/client-domain.exception';
import { ClientRepository } from '../../../domain/repositories/client.repository';
import { ClientDuplicateCheckerService } from '../../../domain/services/client-duplicate-checker.service';
import {
  ClientName,
  ClientReferenceNumber,
  E164PhoneNumber,
  EmailAddress,
} from '../../../domain/value-objects';
import { UpdateClientCommand } from '../../commands/update-client.command';
import { ClientNotFoundException } from '../../exceptions/client-already-exists.exception';
import { UpdateClientUseCase } from '../update-client.usecase';

describe('UpdateClientUseCase Unit Tests', () => {
  let useCase: UpdateClientUseCase;
  let mockClientRepository: jest.Mocked<ClientRepository>;
  let mockDuplicateChecker: jest.Mocked<ClientDuplicateCheckerService>;
  let sampleClient: Client;

  beforeEach(() => {
    sampleClient = Client.register({
      referenceNumber: ClientReferenceNumber.create(2026, 44444),
      name: ClientName.create('Mateo', 'Silva'),
      email: EmailAddress.create('mateo.silva@example.com'),
      phone: E164PhoneNumber.create('+14155554444'),
    });

    mockClientRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockImplementation(async (id) => {
        if (id.value === sampleClient.id) return sampleClient;
        return null;
      }),
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      findByIdentityId: jest.fn(),
      findByReferenceNumber: jest.fn(),
    };

    mockDuplicateChecker = {
      checkHardDuplicates: jest.fn().mockResolvedValue(undefined),
      findPotentialMatches: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<ClientDuplicateCheckerService>;

    useCase = new UpdateClientUseCase(mockClientRepository, mockDuplicateChecker);
  });

  it('should perform partial update on phone number only and save client', async () => {
    const command = new UpdateClientCommand({
      clientId: sampleClient.id,
      expectedVersion: 1,
      phone: '+14155559999',
    });

    const result = await useCase.execute(command);

    expect(result).toBeDefined();
    expect(result.phone).toBe('+14155559999');
    expect(result.firstName).toBe('Mateo');
    expect(result.lastName).toBe('Silva');
    expect(result.version).toBe(2);

    expect(mockDuplicateChecker.checkHardDuplicates).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ value: '+14155559999' }),
      sampleClient.id,
    );
    expect(mockClientRepository.save).toHaveBeenCalledWith(sampleClient);
  });

  it('should perform partial update on name only without triggering duplicate check', async () => {
    const command = new UpdateClientCommand({
      clientId: sampleClient.id,
      expectedVersion: 1,
      firstName: 'Mateo Antonio',
    });

    const result = await useCase.execute(command);

    expect(result.fullName).toBe('Mateo Antonio Silva');
    expect(result.email).toBe('mateo.silva@example.com');
    expect(result.version).toBe(2);

    expect(mockDuplicateChecker.checkHardDuplicates).not.toHaveBeenCalled();
    expect(mockClientRepository.save).toHaveBeenCalledWith(sampleClient);
  });

  it('should throw OptimisticLockException when expectedVersion is mismatched and abort save', async () => {
    const command = new UpdateClientCommand({
      clientId: sampleClient.id,
      expectedVersion: 99,
      firstName: 'NewName',
    });

    await expect(useCase.execute(command)).rejects.toThrow(OptimisticLockException);
    expect(mockClientRepository.save).not.toHaveBeenCalled();
  });

  it('should throw ClientNotFoundException when client ID does not exist', async () => {
    const command = new UpdateClientCommand({
      clientId: '00000000-0000-4000-8000-000000000000',
      expectedVersion: 1,
      firstName: 'Ghost',
    });

    await expect(useCase.execute(command)).rejects.toThrow(ClientNotFoundException);
    expect(mockClientRepository.save).not.toHaveBeenCalled();
  });
});
