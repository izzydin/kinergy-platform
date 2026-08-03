import { BaseSpecification } from './base.specification';
import { TimeRange } from '../value-objects/time-range.vo';
import { AppointmentStatus } from '../value-objects/appointment-status.enum';

export interface ClientAppointmentItem {
  readonly timeRange: TimeRange;
  readonly status: AppointmentStatus;
}

export interface ClientAvailabilityCandidate {
  readonly candidateRange: TimeRange;
  readonly clientAppointments: ReadonlyArray<ClientAppointmentItem>;
}

export class ClientAvailabilitySpecification extends BaseSpecification<ClientAvailabilityCandidate> {
  public isSatisfiedBy(candidate: ClientAvailabilityCandidate): boolean {
    if (!candidate || !candidate.candidateRange || !candidate.clientAppointments) {
      return false;
    }

    const hasConflict = candidate.clientAppointments.some(
      (appt) =>
        appt.status !== AppointmentStatus.CANCELLED &&
        appt.timeRange.overlaps(candidate.candidateRange),
    );

    return !hasConflict;
  }
}
