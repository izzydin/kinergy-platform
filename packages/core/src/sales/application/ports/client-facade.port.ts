/**
 * Lightweight client summary payload retrieved across bounded contexts.
 * Corresponds to public ClientSummaryDto without direct cross-context domain coupling.
 * Codified by ADR-0110 and ADR-0117.
 */
export interface ClientSummaryPayload {
  readonly id: string;
  readonly referenceNumber?: string | null;
  readonly fullName: string;
  readonly email?: string | null;
  readonly phone?: string | null;
}

/**
 * Port interface for retrieving point-in-time client presentation data from the Client bounded context.
 */
export interface ClientFacadePort {
  /**
   * Retrieves client summary by ID or returns null if client does not exist.
   */
  getClientSummary(clientId: string): Promise<ClientSummaryPayload | null>;
}
