export interface ExpiredMembershipDetailDTO {
  readonly membershipId: string;
  readonly clientId: string;
  readonly previousStatus: string;
  readonly expiredAt: string;
}

export interface FailedMembershipDetailDTO {
  readonly membershipId: string;
  readonly error: string;
}

/**
 * Summary DTO returned upon completion of automatic membership expiration processing.
 */
export interface ExpireMembershipsResultDTO {
  readonly processedCount: number;
  readonly expiredCount: number;
  readonly skippedCount: number;
  readonly failedCount: number;
  readonly durationMs: number;
  readonly dryRun: boolean;
  readonly expired: ExpiredMembershipDetailDTO[];
  readonly errors: FailedMembershipDetailDTO[];
}
