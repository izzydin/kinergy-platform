import * as crypto from 'crypto';

/**
 * Utility generating random test values for integration and unit test suites.
 */
export class RandomTestData {
  /**
   * Generates a random email address with an optional prefix.
   */
  public static email(prefix = 'testuser'): string {
    const randomSuffix = crypto.randomBytes(4).toString('hex');
    return `${prefix}_${randomSuffix}@example.com`.toLowerCase();
  }

  /**
   * Generates a random UUID v4.
   */
  public static uuid(): string {
    return crypto.randomUUID();
  }

  /**
   * Generates a random alphanumeric string of target length.
   */
  public static string(length = 12): string {
    return crypto
      .randomBytes(Math.ceil(length / 2))
      .toString('hex')
      .slice(0, length);
  }

  /**
   * Generates a date in the past or future offset by days.
   */
  public static dateOffset(days: number): Date {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }
}
