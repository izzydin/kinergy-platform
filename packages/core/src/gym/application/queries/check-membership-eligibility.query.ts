/**
 * Query to evaluate a client's current eligibility for gym admission.
 */
export class CheckMembershipEligibilityQuery {
  public readonly queryId: string;

  constructor(
    public readonly clientId: string,
    public readonly asOf?: Date,
    queryId?: string,
  ) {
    this.queryId =
      queryId ?? `qry_elig_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
