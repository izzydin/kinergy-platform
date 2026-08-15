import { SessionStatus } from '../treatment-session/session-status.enum';

/**
 * Thrown when an illegal lifecycle state transition is attempted on a TreatmentSession.
 */
export class InvalidSessionTransitionException extends Error {
  public readonly fromStatus: SessionStatus;
  public readonly toStatus: SessionStatus;

  constructor(fromStatus: SessionStatus, toStatus: SessionStatus, message?: string) {
    const defaultMsg = `Cannot transition TreatmentSession from '${fromStatus}' to '${toStatus}'.`;
    super(message ? `${defaultMsg} Reason: ${message}` : defaultMsg);
    this.name = 'InvalidSessionTransitionException';
    this.fromStatus = fromStatus;
    this.toStatus = toStatus;
    Object.setPrototypeOf(this, InvalidSessionTransitionException.prototype);
  }
}
