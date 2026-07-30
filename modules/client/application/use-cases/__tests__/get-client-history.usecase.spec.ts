import { Client } from '../../../domain/aggregates/client.aggregate';
import { ClientTimelineEntry } from '../../../domain/read-models/client-timeline-entry.entity';
import { ClientRepository } from '../../../domain/repositories/client.repository';
import { ClientTimelineRepository } from '../../../domain/repositories/client-timeline.repository';
import {
  ClientName,
  ClientReferenceNumber,
  E164PhoneNumber,
  EmailAddress,
} from '../../../domain/value-objects';
import { PaginatedResultDto } from '../../dto/paginated-result.dto';
import { ClientNotFoundException } from '../../exceptions/client-already-exists.exception';
import { GetClientHistoryQuery } from '../../queries/get-client-history.query';
import { GetClientHistoryUseCase } from '../get-client-history.usecase';

describe('GetClientHistoryUseCase Unit Tests', () => {
  let useCase: GetClientHistoryUseCase;
  let mockClientRepository: jest.Mocked<ClientRepository>;
  let mockTimelineRepository: jest.Mocked<ClientTimelineRepository>;
  let sampleClient: Client;
  let sampleEntries: ClientTimelineEntry[];

  beforeEach(() => {
    sampleClient = Client.register({
      referenceNumber: ClientReferenceNumber.create(2026, 99999),
      name: ClientName.create('Lucia', 'Rios'),
      email: EmailAddress.create('lucia.rios@example.com'),
      phone: E164PhoneNumber.create('+14155559999'),
    });

    sampleEntries = [
      ClientTimelineEntry.create({
        clientId: sampleClient.id,
        sourceModule: 'CLIENT',
        eventType: 'CLIENT_UPDATED',
        summary: 'Client details updated',
        occurredAt: new Date('2026-07-30T12:00:00Z'),
      }),
      ClientTimelineEntry.create({
        clientId: sampleClient.id,
        sourceModule: 'CLIENT',
        eventType: 'CLIENT_CREATED',
        summary: 'Client account registered',
        occurredAt: new Date('2026-07-30T10:00:00Z'),
      }),
    ];

    mockClientRepository = {
      save: jest.fn(),
      findById: jest.fn().mockImplementation(async (id) => {
        if (id.value === sampleClient.id) return sampleClient;
        return null;
      }),
      findByEmail: jest.fn(),
      findByPhone: jest.fn(),
      findByIdentityId: jest.fn(),
      findByReferenceNumber: jest.fn(),
    };

    mockTimelineRepository = {
      save: jest.fn(),
      findByClientId: jest.fn().mockImplementation(async (_id, page, limit) => {
        return PaginatedResultDto.create(sampleEntries, sampleEntries.length, page, limit);
      }),
    };

    useCase = new GetClientHistoryUseCase(mockClientRepository, mockTimelineRepository);
  });

  it('should retrieve paginated timeline entries for an existing client', async () => {
    const query = new GetClientHistoryQuery({
      clientId: sampleClient.id,
      page: 1,
      limit: 10,
    });

    const result = await useCase.execute(query);

    expect(result).toBeDefined();
    expect(result.items).toHaveLength(2);
    expect(result.items[0]!.eventType).toBe('CLIENT_UPDATED');
    expect(result.items[1]!.eventType).toBe('CLIENT_CREATED');
    expect(result.total).toBe(2);

    expect(mockTimelineRepository.findByClientId).toHaveBeenCalledWith(
      expect.objectContaining({ value: sampleClient.id }),
      1,
      10,
    );
  });

  it('should throw ClientNotFoundException when client ID does not exist', async () => {
    const query = new GetClientHistoryQuery({
      clientId: '00000000-0000-4000-8000-000000000000',
    });

    await expect(useCase.execute(query)).rejects.toThrow(ClientNotFoundException);
    expect(mockTimelineRepository.findByClientId).not.toHaveBeenCalled();
  });
});
