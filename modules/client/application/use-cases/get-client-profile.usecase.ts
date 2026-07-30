import { ClientProfileDto } from '../dto/client-profile.dto';
import { ClientNotFoundException } from '../exceptions/client-already-exists.exception';
import { GetClientProfileQuery } from '../queries/get-client-profile.query';
import { ClientRepository } from '../../domain/repositories/client.repository';
import { ClientId } from '../../domain/value-objects/client-id.vo';
import { ClientMapper } from '../../infrastructure/persistence/prisma/client.mapper';

export class GetClientProfileUseCase {
  private static readonly ADMIN_STAFF_ROLES = new Set([
    'ADMIN',
    'SUPER_ADMIN',
    'STAFF',
    'OWNER',
    'TRAINER',
  ]);

  private static readonly AUTHORIZED_PERMISSIONS = new Set([
    'manage:clients',
    'read:clients',
    'manage:users',
  ]);

  constructor(private readonly clientRepository: ClientRepository) {}

  public async execute(query: GetClientProfileQuery): Promise<ClientProfileDto> {
    const clientId = ClientId.create(query.clientId);
    const client = await this.clientRepository.findById(clientId);

    if (!client) {
      throw new ClientNotFoundException(query.clientId);
    }

    const context = query.requestingContext;
    let includeIdentity = false;

    if (context) {
      const hasStaffRole =
        context.roles?.some((role) =>
          GetClientProfileUseCase.ADMIN_STAFF_ROLES.has(role.toUpperCase()),
        ) ?? false;

      const hasStaffPermission =
        context.permissions?.some((perm) =>
          GetClientProfileUseCase.AUTHORIZED_PERMISSIONS.has(perm.toLowerCase()),
        ) ?? false;

      const isSelf = Boolean(
        context.userId && client.identityId && client.identityId === context.userId,
      );

      includeIdentity = hasStaffRole || hasStaffPermission || isSelf;
    }

    return ClientMapper.toProfileDto(client, includeIdentity);
  }
}
