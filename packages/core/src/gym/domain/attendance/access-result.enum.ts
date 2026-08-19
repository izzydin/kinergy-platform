/**
 * Enumeration of attendance access authorization outcomes.
 */
export enum AccessResult {
  /**
   * Access authorized and physical entry granted.
   */
  GRANTED = 'GRANTED',

  /**
   * Access denied because the client is inactive, suspended, or not found.
   */
  DENIED_INACTIVE_CLIENT = 'DENIED_INACTIVE_CLIENT',

  /**
   * Access denied because the client has no membership agreements on record.
   */
  DENIED_NO_MEMBERSHIP = 'DENIED_NO_MEMBERSHIP',

  /**
   * Access denied because the membership period has expired.
   */
  DENIED_EXPIRED = 'DENIED_EXPIRED',

  /**
   * Access denied because the membership is currently frozen.
   */
  DENIED_FROZEN = 'DENIED_FROZEN',

  /**
   * Access denied because the daily visit limit or quota for the plan has been exhausted.
   */
  DENIED_LIMIT_REACHED = 'DENIED_LIMIT_REACHED',

  /**
   * Access denied because the badge was re-scanned within the anti-passback debounce window.
   */
  DENIED_DUPLICATE_CHECKIN = 'DENIED_DUPLICATE_CHECKIN',
}
