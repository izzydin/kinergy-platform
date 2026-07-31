import { ClientProfileDto } from '../dto/client-profile.dto';
import { ClientSummaryDto } from '../dto/client-summary.dto';

/**
 * @public
 * Injection token used to bind `ClientFacade` in the NestJS DI container.
 * External modules should inject this token, not the concrete class.
 *
 * @example
 * ```ts
 * @Inject(CLIENT_FACADE_TOKEN) private readonly clientFacade: IClientFacade
 * ```
 */
export const CLIENT_FACADE_TOKEN = 'IClientFacade';

/**
 * @public
 * Public synchronous API for the Client bounded context.
 *
 * **Invariant:** All cross-module synchronous access to client data MUST go through
 * this interface. External modules MUST NOT import or query internal aggregates,
 * Prisma models, repositories, or domain exceptions from the Client module.
 *
 * All methods return `null` (or `false` / `[]`) instead of throwing domain exceptions
 * when a client is not found, so that consumers do not need to handle Client-internal
 * error types.
 */
export interface IClientFacade {
  /**
   * Retrieves the full profile DTO for a client.
   *
   * @param clientId - The UUID of the client to retrieve.
   * @returns The profile DTO, or `null` if no client with that ID exists.
   */
  getClientProfile(clientId: string): Promise<ClientProfileDto | null>;

  /**
   * Retrieves a lightweight summary DTO for a client.
   *
   * @param clientId - The UUID of the client to retrieve.
   * @returns The summary DTO, or `null` if no client with that ID exists.
   */
  getClientSummary(clientId: string): Promise<ClientSummaryDto | null>;

  /**
   * Checks whether the given client is currently in `ACTIVE` status.
   *
   * @param clientId - The UUID of the client to check.
   * @returns `true` if the client exists and is ACTIVE, `false` otherwise.
   */
  isClientActive(clientId: string): Promise<boolean>;

  /**
   * Full-text search across client profiles, returning lightweight summary DTOs.
   *
   * @param query - Free-text search string (name, email, phone, reference number).
   * @param limit - Maximum number of results to return. Defaults to 10, max 100.
   * @returns Matched summary DTOs, or an empty array if none found.
   */
  searchClientsSummary(query: string, limit?: number): Promise<ClientSummaryDto[]>;
}
