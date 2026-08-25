/**
 * Interface contract for domain Value Objects in Resources bounded context.
 */
export interface ValueObject<T> {
  getValue(): T;
  equals(other: ValueObject<T>): boolean;
}
