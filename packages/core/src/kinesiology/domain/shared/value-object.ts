/**
 * Generic Value Object interface.
 */
export interface ValueObject<T> {
  equals(other: ValueObject<T>): boolean;
  getValue(): T;
}
