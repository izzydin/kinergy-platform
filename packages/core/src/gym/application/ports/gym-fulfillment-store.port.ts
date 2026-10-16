import { MembershipDTO } from '../dtos/membership.dto';

export interface GymFulfillmentRecord {
  readonly paymentRef: string;
  readonly membershipId: string;
  readonly clientId: string;
  readonly planId: string;
  readonly action: 'PURCHASED' | 'RENEWED';
  readonly membershipVersion: number;
  readonly periodStart: string;
  readonly periodEnd: string;
  readonly processedAt: Date;
  readonly snapshotDTO: MembershipDTO;
}

/**
 * Port contract for persisting commercial fulfillment records and idempotency keys.
 * Enables distinguishing retries of the same commercial operation (same paymentRef)
 * from legitimate subsequent renewals (new paymentRef).
 */
export interface GymFulfillmentStorePort {
  findByPaymentRef(paymentRef: string): Promise<GymFulfillmentRecord | null>;
  recordFulfillment(record: GymFulfillmentRecord): Promise<void>;
}

/**
 * In-memory implementation of GymFulfillmentStorePort for unit tests, local development,
 * and fallback execution.
 */
export class InMemoryGymFulfillmentStore implements GymFulfillmentStorePort {
  private readonly records = new Map<string, GymFulfillmentRecord>();

  public async findByPaymentRef(paymentRef: string): Promise<GymFulfillmentRecord | null> {
    return this.records.get(paymentRef.trim()) ?? null;
  }

  public async recordFulfillment(record: GymFulfillmentRecord): Promise<void> {
    this.records.set(record.paymentRef.trim(), { ...record });
  }

  public clear(): void {
    this.records.clear();
  }
}
