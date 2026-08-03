export class BookingIdempotencyPolicy {
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
