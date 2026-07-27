const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Custom Matchers for Jest/Vitest test suites.
 */
export const customTestMatchers = {
  toBeValidUuid(received: string) {
    const pass = typeof received === 'string' && UUID_REGEX.test(received);
    return {
      pass,
      message: () =>
        pass
          ? `Expected '${received}' not to be a valid UUID`
          : `Expected '${received}' to be a valid UUID v4`,
    };
  },

  toBeWithinDateRange(received: Date, startDate: Date, endDate: Date) {
    const time = received.getTime();
    const pass = time >= startDate.getTime() && time <= endDate.getTime();
    return {
      pass,
      message: () =>
        pass
          ? `Expected date ${received.toISOString()} not to be between ${startDate.toISOString()} and ${endDate.toISOString()}`
          : `Expected date ${received.toISOString()} to be between ${startDate.toISOString()} and ${endDate.toISOString()}`,
    };
  },
};
