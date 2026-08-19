import { ValueObject } from '../shared/value-object';
import { InvalidAttendanceException } from '../exceptions/invalid-attendance.exception';

/**
 * Value Object representing a unique Attendance domain entity identifier.
 */
export class AttendanceId implements ValueObject<string> {
  private readonly _value: string;

  private constructor(id: string) {
    if (!id || id.trim().length === 0) {
      throw new InvalidAttendanceException('Attendance ID cannot be empty.');
    }
    this._value = id.trim();
    Object.freeze(this);
  }

  public static create(id?: string): AttendanceId {
    if (id !== undefined) {
      return new AttendanceId(id);
    }
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return new AttendanceId(`att_${timestamp}_${random}`);
  }

  public getValue(): string {
    return this._value;
  }

  public get value(): string {
    return this._value;
  }

  public equals(other: ValueObject<string>): boolean {
    if (!other || !(other instanceof AttendanceId)) {
      return false;
    }
    return this._value === other.getValue();
  }

  public toString(): string {
    return this._value;
  }
}
