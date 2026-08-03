import { ValueObject } from '../shared/value-object';

/**
 * Value Object encapsulating a unique Room identifier.
 * Immutable and frozen on construction.
 */
export class RoomId implements ValueObject<string> {
  private readonly value: string;

  private constructor(id: string) {
    if (!id || id.trim().length === 0) {
      throw new Error('Room ID cannot be empty.');
    }
    this.value = id.trim();
    Object.freeze(this);
  }

  /**
   * Creates a RoomId instance. Generates a default random string ID if omitted.
   *
   * @param id Optional identifier string
   */
  public static create(id?: string): RoomId {
    if (id) {
      return new RoomId(id);
    }
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return new RoomId(`room_${timestamp}_${random}`);
  }

  /** Gets the underlying string value of the RoomId */
  public getValue(): string {
    return this.value;
  }

  /** Checks equality against another RoomId instance */
  public equals(other: ValueObject<string>): boolean {
    if (!other || !(other instanceof RoomId)) {
      return false;
    }
    return this.value === other.getValue();
  }

  /** Returns string representation of RoomId */
  public toString(): string {
    return this.value;
  }
}
