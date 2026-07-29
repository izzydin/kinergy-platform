import { Client } from '../aggregates/client.aggregate';

export class ClientAlreadyLinkedSpecification {
  public isSatisfiedBy(client: Client): boolean {
    if (!client) {
      return false;
    }
    return client.identityId !== null && client.identityId.trim().length > 0;
  }
}
