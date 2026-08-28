/**
 * Functional Result container for explicit application layer responses.
 * Encapsulates success (value) and failure (error) branches without throwing exceptions for expected business errors.
 */
export class ApplicationResult<T, E = string> {
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

  /**
   * Factory method constructing a successful ApplicationResult carrying a payload value.
   */
  public static ok<T, E = string>(value: T): ApplicationResult<T, E> {
    return new ApplicationResult<T, E>(true, value, undefined);
  }

  /**
   * Factory method constructing a failed ApplicationResult carrying an error payload.
   */
  public static fail<T, E = string>(error: E): ApplicationResult<T, E> {
    return new ApplicationResult<T, E>(false, undefined, error);
  }

  /**
   * Retrieves the success payload. Throws if accessed on a failed result.
   */
  public getValue(): T {
    if (!this.isSuccess || this._value === undefined) {
      throw new Error('Cannot retrieve value from a failed ApplicationResult.');
    }
    return this._value;
  }

  /**
   * Retrieves the error payload. Throws if accessed on a successful result.
   */
  public getError(): E {
    if (this.isSuccess || this._error === undefined) {
      throw new Error('Cannot retrieve error from a successful ApplicationResult.');
    }
    return this._error;
  }

  public get value(): T {
    return this.getValue();
  }

  public get error(): E {
    return this.getError();
  }
}
