/**
 * Functional Result container for explicit AI application-layer responses.
 * Encapsulates success (value) and failure (error) outcomes without requiring
 * exception throwing for expected business control flow.
 */
export class AiApplicationResult<T, E = Error> {
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

  public static ok<T, E = Error>(value: T): AiApplicationResult<T, E> {
    return new AiApplicationResult<T, E>(true, value, undefined);
  }

  public static fail<T, E = Error>(error: E): AiApplicationResult<T, E> {
    return new AiApplicationResult<T, E>(false, undefined, error);
  }

  public getValue(): T {
    if (!this.isSuccess || this._value === undefined) {
      throw new Error('Cannot retrieve value from a failed AiApplicationResult.');
    }
    return this._value;
  }

  public getError(): E {
    if (this.isSuccess || this._error === undefined) {
      throw new Error('Cannot retrieve error from a successful AiApplicationResult.');
    }
    return this._error;
  }
}

export { AiApplicationResult as ApplicationResult };
