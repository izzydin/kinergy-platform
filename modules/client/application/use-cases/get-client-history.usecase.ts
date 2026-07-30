import { ClientTimelineEntryDto } from '../dto/client-timeline-entry.dto';
import { PaginatedResultDto } from '../dto/paginated-result.dto';
import { ClientNotFoundException } from '../exceptions/client-already-exists.exception';
import { GetClientHistoryQuery } from '../queries/get-client-history.query';
import { ClientRepository } from '../../domain/repositories/client.repository';
import { ClientTimelineRepository } from '../../domain/repositories/client-timeline.repository';
import { ClientId } from '../../domain/value-objects/client-id.vo';

export class GetClientHistoryUseCase {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly timelineRepository: ClientTimelineRepository,
  ) {}

  public async execute(
    query: GetClientHistoryQuery,
  ): Promise<PaginatedResultDto<ClientTimelineEntryDto>> {
    const clientId = ClientId.create(query.clientId);
    const client = await this.clientRepository.findById(clientId);

    if (!client) {
      throw new ClientNotFoundException(query.clientId);
    }

    const result = await this.timelineRepository.findByClientId(clientId, query.page, query.limit);

    const dtos = result.items.map((entry) => ClientTimelineEntryDto.fromDomain(entry));

    return PaginatedResultDto.create(dtos, result.total, result.page, result.limit);
  }
}
