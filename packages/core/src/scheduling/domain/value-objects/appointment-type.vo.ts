import { ValueObject } from '../shared/value-object';

export enum AppointmentTypeEnum {
  ASSESSMENT = 'ASSESSMENT',
  FOLLOW_UP = 'FOLLOW_UP',
  TREATMENT = 'TREATMENT',
  EVALUATION = 'EVALUATION',
  RENTAL = 'RENTAL',
  GROUP_CLASS = 'GROUP_CLASS',
}

export class AppointmentType implements ValueObject<AppointmentTypeEnum> {
  private readonly value: AppointmentTypeEnum;

  private constructor(type: AppointmentTypeEnum) {
    this.value = type;
    Object.freeze(this);
  }

  public static create(type: AppointmentTypeEnum | string): AppointmentType {
    const validValues = Object.values(AppointmentTypeEnum) as string[];
    if (!validValues.includes(type)) {
      throw new Error(`Invalid appointment type: ${type}`);
    }
    return new AppointmentType(type as AppointmentTypeEnum);
  }

  public getValue(): AppointmentTypeEnum {
    return this.value;
  }

  public equals(other: ValueObject<AppointmentTypeEnum>): boolean {
    if (!other || !(other instanceof AppointmentType)) {
      return false;
    }
    return this.value === other.getValue();
  }

  public toString(): string {
    return this.value;
  }
}
