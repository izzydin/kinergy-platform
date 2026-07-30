import { ClientAlreadyExistsException } from '../../../application/exceptions/client-already-exists.exception';
import { Client } from '../../aggregates/client.aggregate';
import { ClientRepository } from '../../repositories/client.repository';
import { ClientSearchRepository } from '../../repositories/client-search.repository';
import {
  ClientName,
  ClientReferenceNumber,
  E164PhoneNumber,
  EmailAddress,
} from '../../value-objects';
import { ClientDuplicateCheckerService } from '../client-duplicate-checker.service';

describe('ClientDuplicateCheckerService Unit Tests', () => {
  let mockClientRepository: jest.Mocked<ClientRepository>;
  let mockClientSearchRepository: jest.Mocked<ClientSearchRepository>;
  let service: ClientDuplicateCheckerService;

  const createTestClient = (emailStr: string, phoneStr: string) => {
    return Client.register({
      referenceNumber: ClientReferenceNumber.create(2026, 1),
      name: ClientName.create('Lucía', 'Vargas'),
      email: EmailAddress.create(emailStr),
      phone: E164PhoneNumber.create(phoneStr),
    });
  };

  beforeEach(() => {
    mockClientRepository = {
      save: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      findByIdentityId: jest.fn(),
      findByReferenceNumber: jest.fn(),
    };

    mockClientSearchRepository = {
      searchByName: jest.fn(),
      searchByStatus: jest.fn(),
    };

    service = new ClientDuplicateCheckerService(mockClientRepository, mockClientSearchRepository);
  });

  describe('checkHardDuplicates', () => {
    it('should throw ClientAlreadyExistsException when matching email exists', async () => {
      const email = EmailAddress.create('lucia@kinergy.com');
      const phone = E164PhoneNumber.create('+59170000000');
      const existing = createTestClient('lucia@kinergy.com', '+59179999999');

      mockClientRepository.findByEmail.mockResolvedValue(existing);

      await expect(service.checkHardDuplicates(email, phone)).rejects.toThrow(
        ClientAlreadyExistsException,
      );
    });

    it('should throw ClientAlreadyExistsException when matching phone exists', async () => {
      const email = EmailAddress.create('lucia@kinergy.com');
      const phone = E164PhoneNumber.create('+59170000000');
      const existing = createTestClient('other@kinergy.com', '+59170000000');

      mockClientRepository.findByEmail.mockResolvedValue(null);
      mockClientRepository.findByPhone.mockResolvedValue(existing);

      await expect(service.checkHardDuplicates(email, phone)).rejects.toThrow(
        ClientAlreadyExistsException,
      );
    });

    it('should pass cleanly when neither email nor phone exists', async () => {
      const email = EmailAddress.create('unique@kinergy.com');
      const phone = E164PhoneNumber.create('+59170000000');

      mockClientRepository.findByEmail.mockResolvedValue(null);
      mockClientRepository.findByPhone.mockResolvedValue(null);

      await expect(service.checkHardDuplicates(email, phone)).resolves.not.toThrow();
    });
  });

  describe('findPotentialMatches', () => {
    it('should return potential matches by name and phone', async () => {
      const name = ClientName.create('Lucía', 'Vargas');
      const phone = E164PhoneNumber.create('+59170000000');
      const existing = createTestClient('lucia@kinergy.com', '+59170000000');

      mockClientSearchRepository.searchByName.mockResolvedValue([existing]);
      mockClientRepository.findByPhone.mockResolvedValue(null);

      const matches = await service.findPotentialMatches(name, phone);

      expect(matches).toHaveLength(1);
      expect(matches[0]?.clientId).toBe(existing.id);
      expect(matches[0]?.matchReason).toBe('SIMILAR_NAME');
    });
  });
});
