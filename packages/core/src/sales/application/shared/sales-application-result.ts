/**
 * Functional Result container for explicit Sales application layer responses.
 * Encapsulates success (value) and failure (error) branches with type-safe error preservation.
 */
export class SalesApplicationResult<T, E = Error | string> {
  public readonly isSuccess: boolean;
  public readonly isFailure: boolean;
  private readonly _value?: T;
  private readonly _error?: E;

  private constructor(isSuccess: boolean, value?: T, error?: E) {
    this.isSuccess = isSuccess;
    this.isFailure = !isSuccess;
    this._value = value;
    this._error = error;
    Object.freeze(this);
  }

  public static ok<T, E = Error | string>(value: T): SalesApplicationResult<T, E> {
    return new SalesApplicationResult<T, E>(true, value, undefined);
  }

  public static fail<T, E = Error | string>(error: E): SalesApplicationResult<T, E> {
    return new SalesApplicationResult<T, E>(false, undefined, error);
  }

  public getValue(): T {
    if (!this.isSuccess || this._value === undefined) {
      throw new Error('Cannot retrieve value from a failed SalesApplicationResult.');
    }
    return this._value;
  }

  public getError(): E {
    if (this.isSuccess || this._error === undefined) {
      throw new Error('Cannot retrieve error from a successful SalesApplicationResult.');
    }
    return this._error;
  }
}
