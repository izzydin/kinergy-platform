/**
 * Port interface for resolving clinical treatment session fees based on service type.
 */
export interface KinesiologyFeeScheduleResolver {
  getServiceFeeCents(appointmentType?: string): number;
}

/**
 * Default fee resolver mapping clinical appointment types to standard integer-cent rates.
 * Standard treatment rate: $80.00 (8000 cents).
 */
export class DefaultKinesiologyFeeScheduleResolver implements KinesiologyFeeScheduleResolver {
  private readonly rates: Record<string, number> = {
    ASSESSMENT: 12000, // $120.00
    TREATMENT: 8500, // $85.00
    FOLLOW_UP: 6500, // $65.00
    EVALUATION: 9500, // $95.00
  };

  public getServiceFeeCents(appointmentType?: string): number {
    if (!appointmentType) return 8000;
    return this.rates[appointmentType.toUpperCase()] ?? 8000;
  }
}
