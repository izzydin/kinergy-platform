import { AppointmentType, AppointmentTypeEnum } from './appointment-type.vo';

describe('AppointmentType Value Object', () => {
  it('should create valid AppointmentType from enum or string', () => {
    const at1 = AppointmentType.create(AppointmentTypeEnum.ASSESSMENT);
    const at2 = AppointmentType.create('FOLLOW_UP');

    expect(at1.getValue()).toBe(AppointmentTypeEnum.ASSESSMENT);
    expect(at2.getValue()).toBe(AppointmentTypeEnum.FOLLOW_UP);
  });

  it('should throw error for invalid appointment type string', () => {
    expect(() => AppointmentType.create('INVALID_TYPE')).toThrow();
  });

  it('should evaluate equality correctly', () => {
    const at1 = AppointmentType.create(AppointmentTypeEnum.TREATMENT);
    const at2 = AppointmentType.create('TREATMENT');
    const at3 = AppointmentType.create(AppointmentTypeEnum.RENTAL);

    expect(at1.equals(at2)).toBe(true);
    expect(at1.equals(at3)).toBe(false);
  });

  it('should be frozen / immutable', () => {
    const at = AppointmentType.create(AppointmentTypeEnum.EVALUATION);
    expect(Object.isFrozen(at)).toBe(true);
  });
});
