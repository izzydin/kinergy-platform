import { AppointmentType, AppointmentTypeEnum } from '../value-objects/appointment-type.vo';
import { Duration } from '../value-objects/duration.vo';

export interface DurationRule {
  readonly minDuration: Duration;
  readonly maxDuration: Duration;
  readonly standardDuration: Duration;
}

export class DefaultAppointmentDurationPolicy {
  private readonly rules: Map<AppointmentTypeEnum, DurationRule>;

  constructor(customRules?: Map<AppointmentTypeEnum, DurationRule>) {
    this.rules = customRules ?? this.getDefaultRules();
  }

  public validateDuration(
    type: AppointmentType,
    duration: Duration,
  ): { isValid: boolean; reason?: string } {
    const rule = this.rules.get(type.getValue());
    if (!rule) {
      return { isValid: true };
    }

    if (duration.isLessThan(rule.minDuration)) {
      return {
        isValid: false,
        reason: `Duration (${duration.toMinutes()}m) is less than minimum required (${rule.minDuration.toMinutes()}m) for ${type.getValue()}.`,
      };
    }

    if (duration.isGreaterThan(rule.maxDuration)) {
      return {
        isValid: false,
        reason: `Duration (${duration.toMinutes()}m) exceeds maximum allowed (${rule.maxDuration.toMinutes()}m) for ${type.getValue()}.`,
      };
    }

    return { isValid: true };
  }

  public getDefaultDuration(type: AppointmentType): Duration {
    const rule = this.rules.get(type.getValue());
    return rule ? rule.standardDuration : Duration.fromMinutes(60);
  }

  private getDefaultRules(): Map<AppointmentTypeEnum, DurationRule> {
    const map = new Map<AppointmentTypeEnum, DurationRule>();

    map.set(AppointmentTypeEnum.ASSESSMENT, {
      minDuration: Duration.fromMinutes(30),
      maxDuration: Duration.fromMinutes(120),
      standardDuration: Duration.fromMinutes(60),
    });

    map.set(AppointmentTypeEnum.FOLLOW_UP, {
      minDuration: Duration.fromMinutes(15),
      maxDuration: Duration.fromMinutes(60),
      standardDuration: Duration.fromMinutes(30),
    });

    map.set(AppointmentTypeEnum.TREATMENT, {
      minDuration: Duration.fromMinutes(30),
      maxDuration: Duration.fromMinutes(180),
      standardDuration: Duration.fromMinutes(60),
    });

    map.set(AppointmentTypeEnum.EVALUATION, {
      minDuration: Duration.fromMinutes(45),
      maxDuration: Duration.fromMinutes(120),
      standardDuration: Duration.fromMinutes(90),
    });

    map.set(AppointmentTypeEnum.RENTAL, {
      minDuration: Duration.fromMinutes(60),
      maxDuration: Duration.fromMinutes(480),
      standardDuration: Duration.fromMinutes(120),
    });

    map.set(AppointmentTypeEnum.GROUP_CLASS, {
      minDuration: Duration.fromMinutes(30),
      maxDuration: Duration.fromMinutes(120),
      standardDuration: Duration.fromMinutes(60),
    });

    return map;
  }
}
