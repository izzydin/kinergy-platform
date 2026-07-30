import { PaginatedResultDto } from '../../application/dto/paginated-result.dto';
import { ClientTimelineEntry } from '../read-models/client-timeline-entry.entity';
import { ClientId } from '../value-objects/client-id.vo';

export const CLIENT_TIMELINE_REPOSITORY = 'CLIENT_TIMELINE_REPOSITORY';

export interface ClientTimelineRepository {
  save(entry: ClientTimelineEntry): Promise<void>;
  findByClientId(
    clientId: ClientId,
    page: number,
    limit: number,
  ): Promise<PaginatedResultDto<ClientTimelineEntry>>;
}
