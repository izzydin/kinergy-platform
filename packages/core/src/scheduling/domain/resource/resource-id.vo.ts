import { ValueObject } from '../shared/value-object';

/**
 * Value Object encapsulating a unique identifier for any SchedulableResource.
 * Immutable and frozen on construction.
 */
export class ResourceId implements ValueObject<string> {
  private readonly value: string;

  protected constructor(id: string) {
    if (!id || id.trim().length === 0) {
      throw new Error('Resource ID cannot be empty.');
    }
    this.value = id.trim();
    Object.freeze(this);
  }

  /**
   * Creates a ResourceId instance.
   *
   * @param id Identifier string. If omitted, generates a unique random string ID with optional prefix.
   * @param prefix Optional prefix for generated identifiers (default: 'res')
   */
  public static create(id?: string, prefix = 'res'): ResourceId {
    if (id !== undefined) {
      return new ResourceId(id);
    }
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return new ResourceId(`${prefix}_${timestamp}_${random}`);
  }

  /** Gets the raw string value */
  public getValue(): string {
    return this.value;
  }

  /** Value equality check */
  public equals(other: ValueObject<string>): boolean {
    if (!other || !(other instanceof ResourceId)) {
      return false;
    }
    return this.value === other.getValue();
  }

  /** String representation */
  public toString(): string {
    return this.value;
  }
}
