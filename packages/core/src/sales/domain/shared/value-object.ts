/**
 * Contract representing an immutable Value Object in the Sales bounded context.
 */
export interface ValueObject<T> {
  getValue(): T;
  equals(other: ValueObject<T> | undefined | null): boolean;
}
