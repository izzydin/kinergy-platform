import { AppointmentStatus } from '../value-objects/appointment-status.enum';

export class InvalidAppointmentTransitionException extends Error {
  public readonly currentStatus: AppointmentStatus;
  public readonly targetStatus?: AppointmentStatus;

  constructor(
    currentStatus: AppointmentStatus,
    targetStatus?: AppointmentStatus,
    message?: string,
  ) {
    const defaultMsg = targetStatus
      ? `Invalid appointment transition from status '${currentStatus}' to '${targetStatus}'.`
      : `Action is invalid for appointment in status '${currentStatus}'.`;
    super(message ?? defaultMsg);
    this.name = 'InvalidAppointmentTransitionException';
    this.currentStatus = currentStatus;
    this.targetStatus = targetStatus;
    Object.setPrototypeOf(this, InvalidAppointmentTransitionException.prototype);
  }
}
