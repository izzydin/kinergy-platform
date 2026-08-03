/**
 * Contract representing an immutable Value Object in Domain-Driven Design.
 */
export interface ValueObject<T> {
  equals(other: ValueObject<T>): boolean;
  getValue(): T;
}
