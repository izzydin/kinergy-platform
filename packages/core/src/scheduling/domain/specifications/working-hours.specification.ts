import { BaseSpecification } from './base.specification';
import { TherapistSchedule } from '../therapist-schedule/therapist-schedule.aggregate';
import { TimeRange } from '../value-objects/time-range.vo';

export interface WorkingHoursCandidate {
  readonly schedule: TherapistSchedule;
  readonly range: TimeRange;
}

export class WorkingHoursSpecification extends BaseSpecification<WorkingHoursCandidate> {
  public isSatisfiedBy(candidate: WorkingHoursCandidate): boolean {
    if (!candidate || !candidate.schedule || !candidate.range) {
      return false;
    }
    return candidate.schedule.isWorking(candidate.range);
  }
}
