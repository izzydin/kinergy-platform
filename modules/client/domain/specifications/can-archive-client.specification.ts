import { Client } from '../aggregates/client.aggregate';
import { ClientStatus } from '../value-objects/client-status.enum';

export class CanArchiveClientSpecification {
  public isSatisfiedBy(client: Client): boolean {
    if (!client) {
      return false;
    }
    return client.status === ClientStatus.ACTIVE;
  }
}
