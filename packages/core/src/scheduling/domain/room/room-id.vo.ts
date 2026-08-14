import { ResourceId } from '../resource/resource-id.vo';
import { ValueObject } from '../shared/value-object';

/**
 * Value Object encapsulating a unique Room identifier.
 * Extends the generic ResourceId identity.
 * Immutable and frozen on construction.
 */
export class RoomId extends ResourceId {
  private constructor(id: string) {
    super(id);
  }

  /**
   * Creates a RoomId instance. Generates a default random string ID with 'room_' prefix if omitted.
   *
   * @param id Optional identifier string
   */
  public static override create(id?: string): RoomId {
    if (id) {
      return new RoomId(id);
    }
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return new RoomId(`room_${timestamp}_${random}`);
  }

  /** Checks equality against another RoomId instance */
  public override equals(other: ValueObject<string>): boolean {
    if (!other || !(other instanceof RoomId)) {
      return false;
    }
    return this.getValue() === other.getValue();
  }
}
