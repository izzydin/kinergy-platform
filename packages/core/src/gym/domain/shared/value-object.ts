/**
 * Interface contract for domain Value Objects.
 */
export interface ValueObject<T> {
  getValue(): T;
  equals(other: ValueObject<T>): boolean;
}
