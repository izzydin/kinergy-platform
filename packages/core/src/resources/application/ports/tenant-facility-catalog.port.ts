export interface FacilitySummary {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly tenantId: string;
  readonly description?: string;
  readonly rooms?: ReadonlyArray<{ id: string; name: string }>;
}

export interface TenantFacilityCatalogPort {
  getFacilitiesForTenant(tenantId: string): Promise<FacilitySummary[]>;
  getFacilityById(tenantId: string, facilityId: string): Promise<FacilitySummary | null>;
  validateFacilityAccess(
    tenantId: string,
    facilityId: string,
    actorId?: string,
  ): Promise<{ valid: boolean; reason?: string }>;
}
