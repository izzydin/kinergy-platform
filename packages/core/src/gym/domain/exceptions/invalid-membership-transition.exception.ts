export class InvalidMembershipTransitionException extends Error {
  constructor(
    public readonly currentState: string,
    public readonly targetState: string,
    public readonly reason?: string,
  ) {
    const detail = reason ? ` (${reason})` : '';
    super(
      `Cannot transition Membership from status '${currentState}' to status '${targetState}'${detail}.`,
    );
    this.name = 'InvalidMembershipTransitionException';
    Object.setPrototypeOf(this, InvalidMembershipTransitionException.prototype);
  }
}
