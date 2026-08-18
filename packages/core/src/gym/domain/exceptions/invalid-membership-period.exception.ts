export class InvalidMembershipPeriodException extends Error {
  constructor(message: string) {
    super(`Invalid Membership Period: ${message}`);
    this.name = 'InvalidMembershipPeriodException';
    Object.setPrototypeOf(this, InvalidMembershipPeriodException.prototype);
  }
}
