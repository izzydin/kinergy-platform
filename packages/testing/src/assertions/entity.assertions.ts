/**
 * Assertions for DDD Entity comparison and validation.
 */
export class EntityAssertions {
  /**
   * Asserts that two domain entities share identical ID identity.
   */
  public static expectEqualId<T extends { id: string }>(entityA: T, entityB: T): void {
    if (entityA.id !== entityB.id) {
      throw new Error(
        `Expected entities to have equal ID, but received '${entityA.id}' and '${entityB.id}'.`,
      );
    }
  }
}
