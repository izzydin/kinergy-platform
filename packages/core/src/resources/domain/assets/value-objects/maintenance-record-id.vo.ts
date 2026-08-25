import { ValueObject } from '../../shared/value-object';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class MaintenanceRecordId implements ValueObject<string> {
  private readonly _value: string;

  private constructor(value: string) {
    if (!value || !UUID_REGEX.test(value)) {
      throw new Error(`Invalid MaintenanceRecordId format. Expected UUID v4, got: '${value}'`);
    }
    this._value = value.toLowerCase();
    Object.freeze(this);
  }

  public static create(value?: string): MaintenanceRecordId {
    return new MaintenanceRecordId(value ?? crypto.randomUUID());
  }

  public get value(): string {
    return this._value;
  }

  public getValue(): string {
    return this._value;
  }

  public toJSON(): string {
    return this._value;
  }

  public equals(other: ValueObject<string>): boolean {
    if (!other || !(other instanceof MaintenanceRecordId)) {
      return false;
    }
    return this._value === other.value;
  }

  public toString(): string {
    return this._value;
  }
}
