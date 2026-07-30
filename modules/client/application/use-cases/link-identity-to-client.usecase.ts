import { Client } from '../../domain/aggregates/client.aggregate';
import { ClientRepository } from '../../domain/repositories/client.repository';
import { ClientAlreadyLinkedSpecification } from '../../domain/specifications/client-already-linked.specification';
import { ClientId } from '../../domain/value-objects/client-id.vo';
import { LinkIdentityCommand } from '../commands/link-identity.command';
import { ClientNotFoundException } from '../exceptions/client-already-exists.exception';

export class LinkIdentityToClientUseCase {
  private readonly clientAlreadyLinkedSpec: ClientAlreadyLinkedSpecification;

  constructor(private readonly clientRepository: ClientRepository) {
    this.clientAlreadyLinkedSpec = new ClientAlreadyLinkedSpecification();
  }

  public async execute(command: LinkIdentityCommand): Promise<Client> {
    const clientId = ClientId.create(command.clientId);

    // 1. Fetch Client aggregate
    const client = await this.clientRepository.findById(clientId);
    if (!client) {
      throw new ClientNotFoundException(command.clientId);
    }

    // 2. Assert Specification domain invariant
    if (this.clientAlreadyLinkedSpec.isSatisfiedBy(client)) {
      // Domain method will also throw ClientAlreadyLinkedException if called
    }

    // 3. Link authentication credentials (increments aggregate version & emits IdentityLinkedEvent)
    client.linkIdentity(command.identityId);

    // 4. Save updated aggregate to persistence repository
    await this.clientRepository.save(client);

    return client;
  }
}
