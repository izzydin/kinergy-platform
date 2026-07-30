import { ClientProfileDto } from '../dto/client-profile.dto';
import { ClientNotFoundException } from '../exceptions/client-already-exists.exception';
import { ArchiveClientCommand } from '../commands/archive-client.command';
import { ClientRepository } from '../../domain/repositories/client.repository';
import { ClientId } from '../../domain/value-objects/client-id.vo';
import { ClientMapper } from '../../infrastructure/persistence/prisma/client.mapper';

export class ArchiveClientUseCase {
  constructor(private readonly clientRepository: ClientRepository) {}

  public async execute(command: ArchiveClientCommand): Promise<ClientProfileDto> {
    const clientId = ClientId.create(command.clientId);
    const client = await this.clientRepository.findById(clientId);

    if (!client) {
      throw new ClientNotFoundException(command.clientId);
    }

    client.archive(command.expectedVersion);

    await this.clientRepository.save(client);

    return ClientMapper.toProfileDto(client, true);
  }
}
