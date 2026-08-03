import { BaseSpecification } from './base.specification';
import { TherapistSchedule } from '../therapist-schedule/therapist-schedule.aggregate';
import { TimeRange } from '../value-objects/time-range.vo';

export interface TherapistAvailabilityCandidate {
  readonly schedule: TherapistSchedule;
  readonly range: TimeRange;
}

export class TherapistAvailabilitySpecification extends BaseSpecification<TherapistAvailabilityCandidate> {
  public isSatisfiedBy(candidate: TherapistAvailabilityCandidate): boolean {
    if (!candidate || !candidate.schedule || !candidate.range) {
      return false;
    }
    return candidate.schedule.isAvailable(candidate.range);
  }
}
