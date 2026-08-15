import { KinesiologyDomainException } from './kinesiology.exception';
import { InvalidSessionTransitionException } from './invalid-session-transition.exception';
import { SessionStatus } from '../treatment-session/session-status.enum';

describe('Kinesiology Domain Exceptions', () => {
  it('should instantiate InvalidSessionTransitionException with custom details and code', () => {
    const error = new InvalidSessionTransitionException(
      SessionStatus.SCHEDULED,
      SessionStatus.COMPLETED,
      'Session must be in IN_PROGRESS status to be completed.',
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(KinesiologyDomainException);
    expect(error).toBeInstanceOf(InvalidSessionTransitionException);
    expect(error.code).toBe('INVALID_SESSION_TRANSITION');
    expect(error.fromStatus).toBe(SessionStatus.SCHEDULED);
    expect(error.toStatus).toBe(SessionStatus.COMPLETED);
    expect(error.message).toBe(
      "Cannot transition TreatmentSession from 'SCHEDULED' to 'COMPLETED'. Session must be in IN_PROGRESS status to be completed.",
    );
  });

  it('should format default message when no custom details are provided', () => {
    const error = new InvalidSessionTransitionException(
      SessionStatus.COMPLETED,
      SessionStatus.IN_PROGRESS,
    );

    expect(error.message).toBe(
      "Cannot transition TreatmentSession from 'COMPLETED' to 'IN_PROGRESS'.",
    );
  });
});
