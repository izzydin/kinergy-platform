/**
 * Assertions for functional Result objects across domain & application layers.
 */
export class ResultAssertions {
  /**
   * Asserts that a Result object is successful.
   */
  public static expectOk<T>(result: { isSuccess: boolean; value?: T; error?: unknown }): T {
    if (!result.isSuccess) {
      throw new Error(
        `Expected Result to be OK, but received failure: ${JSON.stringify(result.error)}`,
      );
    }
    return result.value as T;
  }

  /**
   * Asserts that a Result object is a failure.
   */
  public static expectFail<E>(result: { isSuccess: boolean; error?: E }): E {
    if (result.isSuccess) {
      throw new Error('Expected Result to be Failure, but received OK.');
    }
    return result.error as E;
  }
}
