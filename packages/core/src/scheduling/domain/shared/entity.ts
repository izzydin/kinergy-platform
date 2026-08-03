/**
 * Base contract for domain entities with identity.
 */
export interface Entity<ID = string> {
  readonly id: ID;
  equals(other: Entity<ID>): boolean;
}
