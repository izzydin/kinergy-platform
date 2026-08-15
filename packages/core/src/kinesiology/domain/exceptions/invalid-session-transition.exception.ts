import { KinesiologyDomainException } from './kinesiology.exception';
import { SessionStatus } from '../treatment-session/session-status.enum';

/**
 * Thrown when an illegal lifecycle state transition is attempted on a TreatmentSession aggregate.
 */
export class InvalidSessionTransitionException extends KinesiologyDomainException {
  public readonly code = 'INVALID_SESSION_TRANSITION';

  constructor(
    public readonly fromStatus: SessionStatus,
    public readonly toStatus: SessionStatus,
    details?: string,
  ) {
    const baseMessage = `Cannot transition TreatmentSession from '${fromStatus}' to '${toStatus}'.`;
    super(details ? `${baseMessage} ${details}` : baseMessage);
  }
}
