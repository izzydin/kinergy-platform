import { TenantFacilityCatalogPort, FacilitySummary } from '../ports/tenant-facility-catalog.port';

export class DefaultTenantFacilityCatalogService implements TenantFacilityCatalogPort {
  private readonly facilities: Map<string, FacilitySummary> = new Map();

  constructor() {
    this.seedDefaults();
  }

  private seedDefaults(): void {
    // Primary tenants
    const primaryTenants = [
      'tenant-kinergy-main',
      'tenant_main',
      'tenant_enterprise',
      'tenant_gym_01',
      'default_tenant',
    ];

    for (const tid of primaryTenants) {
      this.registerFacility({
        id: 'fac-main',
        name: 'Main Facility - Central Campus',
        code: 'FAC-MAIN',
        status: 'ACTIVE',
        tenantId: tid,
        description: 'Primary sports therapy, gym & clinical center',
        rooms: [
          { id: 'room-seed-kinesio-01', name: 'Room 1 - Kinesiology Therapy Suite' },
          { id: 'room-seed-consult-02', name: 'Room 2 - Assessment & Consultation' },
          { id: 'studio-b-facility', name: 'Studio B - Movement Room' },
        ],
      });

      this.registerFacility({
        id: 'fac-west',
        name: 'West Campus - Cardio & Rehab Center',
        code: 'FAC-WEST',
        status: 'ACTIVE',
        tenantId: tid,
        description: 'West satellite wing dedicated to cardio and athletic conditioning',
        rooms: [{ id: 'room-west-cardio-01', name: 'Cardio Suite W1' }],
      });

      this.registerFacility({
        id: 'fac-north',
        name: 'North Branch - Movement Studio',
        code: 'FAC-NORTH',
        status: 'ACTIVE',
        tenantId: tid,
        description: 'North regional branch for pilates and functional mobility',
        rooms: [{ id: 'room-north-pilates-01', name: 'Pilates Studio N1' }],
      });

      this.registerFacility({
        id: 'fac-secondary',
        name: 'Secondary Clinic - Physical Therapy Depot',
        code: 'FAC-SEC',
        status: 'ACTIVE',
        tenantId: tid,
        description: 'Outpatient clinical consultation and physical therapy clinic',
        rooms: [{ id: 'room_gym_02', name: 'Rehabilitation Floor 2' }],
      });

      this.registerFacility({
        id: 'fac-inactive',
        name: 'Old Storage Depot (Decommissioned)',
        code: 'FAC-INACT',
        status: 'INACTIVE',
        tenantId: tid,
        description: 'Decommissioned warehouse site',
      });
    }

    // Rival / isolated tenant for cross-tenant boundary validation
    this.registerFacility({
      id: 'fac-rival-01',
      name: 'Rival Wellness Club',
      code: 'FAC-RIVAL',
      status: 'ACTIVE',
      tenantId: 'tenant_rival_facility',
      description: 'External competitor facility',
    });

    this.registerFacility({
      id: 'fac-other-01',
      name: 'Other Tenant Satellite Center',
      code: 'FAC-OTHER',
      status: 'ACTIVE',
      tenantId: 'tenant_other_facility',
      description: 'Secondary tenant facility',
    });
  }

  public registerFacility(facility: FacilitySummary): void {
    const key = `${facility.tenantId}:::${facility.id.toLowerCase()}`;
    this.facilities.set(key, facility);

    // Register alias variants (hyphen vs underscore)
    if (facility.id.includes('-')) {
      const aliasKey = `${facility.tenantId}:::${facility.id.replace(/-/g, '_').toLowerCase()}`;
      this.facilities.set(aliasKey, facility);
    } else if (facility.id.includes('_')) {
      const aliasKey = `${facility.tenantId}:::${facility.id.replace(/_/g, '-').toLowerCase()}`;
      this.facilities.set(aliasKey, facility);
    }
  }

  public async getFacilitiesForTenant(tenantId: string): Promise<FacilitySummary[]> {
    const results: FacilitySummary[] = [];
    const seenIds = new Set<string>();

    for (const facility of this.facilities.values()) {
      if (facility.tenantId === tenantId && !seenIds.has(facility.id)) {
        seenIds.add(facility.id);
        results.push(facility);
      }
    }

    return results;
  }

  public async getFacilityById(
    tenantId: string,
    facilityId: string,
  ): Promise<FacilitySummary | null> {
    const normalizedId = facilityId.trim().toLowerCase();
    const key = `${tenantId}:::${normalizedId}`;
    return this.facilities.get(key) || null;
  }

  public async validateFacilityAccess(
    tenantId: string,
    facilityId: string,
    _actorId?: string,
  ): Promise<{ valid: boolean; reason?: string }> {
    if (!facilityId || typeof facilityId !== 'string' || facilityId.trim().length === 0) {
      return { valid: false, reason: 'Facility ID is mandatory for asset location.' };
    }

    const facility = await this.getFacilityById(tenantId, facilityId);
    if (!facility) {
      // Check if this facility belongs to another tenant for boundary auditing
      let belongsToOtherTenant = false;
      let owningTenant = '';
      for (const f of this.facilities.values()) {
        const idMatches =
          f.id.toLowerCase() === facilityId.toLowerCase() ||
          f.id.replace(/-/g, '_').toLowerCase() === facilityId.toLowerCase() ||
          f.id.replace(/_/g, '-').toLowerCase() === facilityId.toLowerCase();

        if (idMatches && f.tenantId !== tenantId) {
          belongsToOtherTenant = true;
          owningTenant = f.tenantId;
          break;
        }
      }

      if (belongsToOtherTenant) {
        return {
          valid: false,
          reason: `Target facility '${facilityId}' belongs to another tenant ('${owningTenant}') and cannot be accessed.`,
        };
      }

      return {
        valid: false,
        reason: `Target facility '${facilityId}' does not exist in domain registry for tenant '${tenantId}'.`,
      };
    }

    if (facility.status !== 'ACTIVE') {
      return {
        valid: false,
        reason: `Facility '${facility.name}' (${facility.id}) is inactive and cannot accept asset assignments.`,
      };
    }

    return { valid: true };
  }
}
