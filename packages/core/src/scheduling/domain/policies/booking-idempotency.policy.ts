/**
 * Business Policy validating request idempotency tokens to prevent duplicate bookings on network retries.
 */
export class BookingIdempotencyPolicy {
  private readonly processedKeys = new Set<string>();

  /**
   * Checks and registers an idempotency request key.
   *
   * @param requestKey Optional request key token
   * @returns True if key is duplicate, false if new and registered
   */
  public registerRequest(requestKey?: string): boolean {
    if (!requestKey || requestKey.trim().length === 0) {
      return true; // Valid (not a duplicate)
    }
    const cleanKey = requestKey.trim();
    if (this.processedKeys.has(cleanKey)) {
      return false; // Invalid (duplicate)
    }
    this.processedKeys.add(cleanKey);
    return true; // Registered
  }

  public validateIdempotency(
    requestKey: string,
    existingRequestKeys: ReadonlySet<string>,
  ): { isDuplicate: boolean; reason?: string } {
    if (!requestKey || requestKey.trim().length === 0) {
      return {
        isDuplicate: false,
      };
    }

    const cleanKey = requestKey.trim();
    if (existingRequestKeys.has(cleanKey)) {
      return {
        isDuplicate: true,
        reason: `Duplicate booking request detected with idempotency key '${cleanKey}'.`,
      };
    }

    return {
      isDuplicate: false,
    };
  }
}
