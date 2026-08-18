export class OverlappingMembershipException extends Error {
  constructor(
    public readonly clientId: string,
    public readonly conflictingMembershipId: string,
    message?: string,
  ) {
    super(
      message ??
        `Client '${clientId}' already has an active or overlapping membership (Conflicting Membership ID: '${conflictingMembershipId}').`,
    );
    this.name = 'OverlappingMembershipException';
    Object.setPrototypeOf(this, OverlappingMembershipException.prototype);
  }
}
