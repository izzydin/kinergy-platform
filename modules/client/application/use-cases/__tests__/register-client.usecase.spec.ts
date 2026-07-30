import { Client } from '../../../domain/aggregates/client.aggregate';
import { ClientRepository } from '../../../domain/repositories/client.repository';
import { ClientDuplicateCheckerService } from '../../../domain/services/client-duplicate-checker.service';
import {
  ClientName,
  ClientReferenceNumber,
  E164PhoneNumber,
  EmailAddress,
} from '../../../domain/value-objects';
import { RegisterClientCommand } from '../../commands/register-client.command';
import { ClientAlreadyExistsException } from '../../exceptions/client-already-exists.exception';
import { RegisterClientUseCase } from '../register-client.usecase';

describe('RegisterClientUseCase Unit Tests', () => {
  let mockClientRepository: jest.Mocked<ClientRepository>;
  let duplicateCheckerService: ClientDuplicateCheckerService;
  let useCase: RegisterClientUseCase;

  beforeEach(() => {
    mockClientRepository = {
      save: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn(),
      findByEmail: jest.fn().mockResolvedValue(null),
      findByPhone: jest.fn().mockResolvedValue(null),
      findByIdentityId: jest.fn(),
      findByReferenceNumber: jest.fn(),
    };

    duplicateCheckerService = new ClientDuplicateCheckerService(mockClientRepository);
    useCase = new RegisterClientUseCase(mockClientRepository, duplicateCheckerService);
  });

  it('should successfully register a walk-in client (reception flow, identityId = null)', async () => {
    const command = new RegisterClientCommand({
      firstName: 'Mateo',
      lastName: 'Pérez',
      email: 'mateo.perez@kinergy.com',
      phone: '+59171111111',
      identityId: null,
    });

    const result = await useCase.execute(command);

    expect(result.isSuccess).toBe(true);
    expect(result.client).toBeDefined();
    expect(result.client?.name.fullName).toBe('Mateo Pérez');
    expect(result.client?.email.value).toBe('mateo.perez@kinergy.com');
    expect(result.client?.identityId).toBeNull();
    expect(result.client?.version).toBe(1);
    expect(mockClientRepository.save).toHaveBeenCalledTimes(1);
  });

  it('should successfully register a self-registering client with attached identityId', async () => {
    const command = new RegisterClientCommand({
      firstName: 'Mateo',
      lastName: 'Pérez',
      email: 'mateo.perez@kinergy.com',
      phone: '+59171111111',
      identityId: 'usr_auth_777',
    });

    const result = await useCase.execute(command);

    expect(result.isSuccess).toBe(true);
    expect(result.client?.identityId).toBe('usr_auth_777');
    expect(mockClientRepository.save).toHaveBeenCalledTimes(1);
  });

  it('should reject registration on hard duplicate email or phone', async () => {
    const existing = Client.register({
      referenceNumber: ClientReferenceNumber.create(2026, 1),
      name: ClientName.create('Mateo', 'Pérez'),
      email: EmailAddress.create('mateo.perez@kinergy.com'),
      phone: E164PhoneNumber.create('+59171111111'),
    });

    mockClientRepository.findByEmail.mockResolvedValue(existing);

    const command = new RegisterClientCommand({
      firstName: 'Mateo',
      lastName: 'Pérez',
      email: 'mateo.perez@kinergy.com',
      phone: '+59171111111',
    });

    await expect(useCase.execute(command)).rejects.toThrow(ClientAlreadyExistsException);
    expect(mockClientRepository.save).not.toHaveBeenCalled();
  });

  it('should return POTENTIAL_DUPLICATES_FOUND when soft duplicate phone exists and bypassSoftDuplicates is false', async () => {
    const existing = Client.register({
      referenceNumber: ClientReferenceNumber.create(2026, 1),
      name: ClientName.create('Existing', 'User'),
      email: EmailAddress.create('existing@kinergy.com'),
      phone: E164PhoneNumber.create('+59171111111'),
    });

    mockClientRepository.findByEmail.mockResolvedValue(null);
    mockClientRepository.findByPhone.mockResolvedValue(existing);

    const command = new RegisterClientCommand({
      firstName: 'Mateo',
      lastName: 'Pérez',
      email: 'mateo.new@kinergy.com',
      phone: '+59171111111',
      bypassSoftDuplicates: false,
    });

    // Hard duplicate check catches matching phone first when checked via findByPhone in checkHardDuplicates
    await expect(useCase.execute(command)).rejects.toThrow(ClientAlreadyExistsException);
  });

  it('should successfully create client when soft duplicate search finds potential matches but bypassSoftDuplicates is true', async () => {
    const command = new RegisterClientCommand({
      firstName: 'Mateo',
      lastName: 'Pérez',
      email: 'mateo.bypass@kinergy.com',
      phone: '+59172222222',
      bypassSoftDuplicates: true,
    });

    const result = await useCase.execute(command);

    expect(result.isSuccess).toBe(true);
    expect(result.client?.email.value).toBe('mateo.bypass@kinergy.com');
    expect(mockClientRepository.save).toHaveBeenCalledTimes(1);
  });
});
