export class InvalidPlanTransitionException extends Error {
  constructor(
    public readonly currentState: string,
    public readonly targetState: string,
    public readonly reason?: string,
  ) {
    const detail = reason ? ` (${reason})` : '';
    super(
      `Cannot transition MembershipPlan from status '${currentState}' to status '${targetState}'${detail}.`,
    );
    this.name = 'InvalidPlanTransitionException';
    Object.setPrototypeOf(this, InvalidPlanTransitionException.prototype);
  }
}
