import { Injectable } from '@nestjs/common';
import { GetClientProfileUseCase } from '../application/use-cases/get-client-profile.usecase';
import { SearchClientsUseCase } from '../application/use-cases/search-clients.usecase';
import { GetClientProfileQuery } from '../application/queries/get-client-profile.query';
import { SearchClientsQuery } from '../application/queries/search-clients.query';
import { ClientNotFoundException } from '../application/exceptions/client-already-exists.exception';
import { ClientProfileDto } from './dto/client-profile.dto';
import { ClientSummaryDto } from './dto/client-summary.dto';
import { IClientFacade } from './interfaces/client-facade.interface';

/**
 * @public
 * Concrete implementation of {@link IClientFacade}.
 *
 * This is the **single synchronous entry point** for all cross-module access to the
 * Client bounded context. External modules MUST inject this via the `IClientFacade`
 * interface token — they MUST NOT import internal use cases, repositories, aggregates,
 * or domain exceptions directly.
 *
 * **Boundary invariants enforced here:**
 * - `ClientNotFoundException` is caught and translated to `null` returns, so internal
 *   domain exception types never leak across the module boundary.
 * - Returned DTOs contain only the fields that are safe for cross-module consumption.
 *
 * @implements {IClientFacade}
 */
@Injectable()
export class ClientFacade implements IClientFacade {
  constructor(
    private readonly getClientProfileUseCase: GetClientProfileUseCase,
    private readonly searchClientsUseCase: SearchClientsUseCase,
  ) {}

  /**
   * {@inheritDoc IClientFacade.getClientProfile}
   */
  async getClientProfile(clientId: string): Promise<ClientProfileDto | null> {
    try {
      const query = new GetClientProfileQuery({ clientId });
      return await this.getClientProfileUseCase.execute(query);
    } catch (err) {
      if (err instanceof ClientNotFoundException) {
        return null;
      }
      throw err;
    }
  }

  /**
   * {@inheritDoc IClientFacade.getClientSummary}
   */
  async getClientSummary(clientId: string): Promise<ClientSummaryDto | null> {
    const profile = await this.getClientProfile(clientId);
    if (!profile) {
      return null;
    }
    return this.toSummaryDto(profile);
  }

  /**
   * {@inheritDoc IClientFacade.isClientActive}
   */
  async isClientActive(clientId: string): Promise<boolean> {
    const profile = await this.getClientProfile(clientId);
    return profile?.status === 'ACTIVE';
  }

  /**
   * {@inheritDoc IClientFacade.searchClientsSummary}
   */
  async searchClientsSummary(query: string, limit = 10): Promise<ClientSummaryDto[]> {
    const searchQuery = new SearchClientsQuery({
      query: query.trim(),
      limit,
      page: 1,
      includeArchived: false,
    });

    const result = await this.searchClientsUseCase.execute(searchQuery);
    return result.items.map((profile) => this.toSummaryDto(profile));
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private toSummaryDto(profile: ClientProfileDto): ClientSummaryDto {
    return Object.assign(new ClientSummaryDto(), {
      id: profile.id,
      referenceNumber: profile.referenceNumber,
      fullName: profile.fullName.trim(),
      email: profile.email,
      phone: profile.phone,
      status: profile.status,
    } satisfies Omit<ClientSummaryDto, never>);
  }
}
