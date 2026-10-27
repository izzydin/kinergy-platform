/**
 * Commercial reference projection for schedulable rooms entering the Sales domain.
 * Adheres strictly to ADR-0121 and ADR-0139.
 */
export interface RoomCommercialReference {
  readonly id: string;
  readonly name: string;
  readonly capacity: number;
  readonly isAvailableForRental: boolean;
  readonly hourlyRateCents: number;
  readonly currency: string;
  readonly status: string;
  readonly version?: number;
}

/**
 * Outbound port for Sales to verify room existence, rental availability, and commercial rates.
 * Enforces hexagonal decoupling between Sales and Scheduling.
 */
export interface ISchedulingRoomLookupPort {
  getRoomReference(roomId: string, tenantId?: string): Promise<RoomCommercialReference | null>;
}
