import { ValueObject } from '../shared/value-object';

export class AppointmentId implements ValueObject<string> {
  private readonly value: string;

  private constructor(id: string) {
    if (!id || id.trim().length === 0) {
      throw new Error('Appointment ID cannot be empty.');
    }
    this.value = id.trim();
    Object.freeze(this);
  }

  public static create(id?: string): AppointmentId {
    if (id) {
      return new AppointmentId(id);
    }
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return new AppointmentId(`appt_${timestamp}_${random}`);
  }

  public getValue(): string {
    return this.value;
  }

  public equals(other: ValueObject<string>): boolean {
    if (!other || !(other instanceof AppointmentId)) {
      return false;
    }
    return this.value === other.getValue();
  }

  public toString(): string {
    return this.value;
  }
}
