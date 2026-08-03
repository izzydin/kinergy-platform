import { BaseSpecification } from './base.specification';
import { TimeRange } from '../value-objects/time-range.vo';
import { AppointmentStatus } from '../value-objects/appointment-status.enum';

export interface ExistingAppointmentItem {
  readonly timeRange: TimeRange;
  readonly status: AppointmentStatus;
}

export interface AppointmentOverlapCandidate {
  readonly candidateRange: TimeRange;
  readonly existingAppointments: ReadonlyArray<ExistingAppointmentItem>;
}

export class AppointmentOverlapSpecification extends BaseSpecification<AppointmentOverlapCandidate> {
  public isSatisfiedBy(candidate: AppointmentOverlapCandidate): boolean {
    if (!candidate || !candidate.candidateRange || !candidate.existingAppointments) {
      return false;
    }

    const hasOverlap = candidate.existingAppointments.some(
      (appt) =>
        appt.status !== AppointmentStatus.CANCELLED &&
        appt.timeRange.overlaps(candidate.candidateRange),
    );

    return !hasOverlap;
  }
}
