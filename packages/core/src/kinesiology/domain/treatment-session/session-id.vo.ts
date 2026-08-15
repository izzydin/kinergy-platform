import { ValueObject } from '../shared/value-object';

/**
 * Value Object representing a unique TreatmentSession identifier.
 */
export class SessionId implements ValueObject<string> {
  private readonly value: string;

  private constructor(id: string) {
    if (!id || id.trim().length === 0) {
      throw new Error('Session ID cannot be empty.');
    }
    this.value = id.trim();
    Object.freeze(this);
  }

  public static create(id?: string): SessionId {
    if (id !== undefined) {
      return new SessionId(id);
    }
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return new SessionId(`sess_${timestamp}_${random}`);
  }

  public getValue(): string {
    return this.value;
  }

  public equals(other: ValueObject<string>): boolean {
    if (!other || !(other instanceof SessionId)) {
      return false;
    }
    return this.value === other.getValue();
  }

  public toString(): string {
    return this.value;
  }
}
