export class MembershipPlanInvariantViolationException extends Error {
  constructor(message: string) {
    super(`MembershipPlan invariant violation: ${message}`);
    this.name = 'MembershipPlanInvariantViolationException';
    Object.setPrototypeOf(this, MembershipPlanInvariantViolationException.prototype);
  }
}
