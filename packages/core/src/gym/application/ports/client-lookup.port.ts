/**
 * Port interface for verifying external Client identity existence.
 * Decouples Gym Management from direct Client aggregate/database dependencies.
 */
export interface ClientLookupPort {
  /**
   * Returns true if the client exists and is eligible for gym memberships.
   */
  validateClientExists(clientId: string): Promise<boolean>;
}
