export interface AuthorizationRequirementsProps {
  requiredRoles?: string[];
  requiredPermissions?: string[];
  tenantId?: string | null;
  resourceId?: string | null;
  attributes?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * Domain Value Object representing authorization policy requirements requested by an endpoint or resource.
 * Extensible for future ABAC attributes, ownership rules, feature flags, or tenant boundaries.
 */
export class AuthorizationRequirements {
  public readonly requiredRoles: ReadonlyArray<string>;
  public readonly requiredPermissions: ReadonlyArray<string>;
  public readonly tenantId: string | null;
  public readonly resourceId: string | null;
  public readonly attributes: Readonly<Record<string, unknown>>;
  public readonly metadata: Readonly<Record<string, unknown>>;

  constructor(props: AuthorizationRequirementsProps = {}) {
    this.requiredRoles = Object.freeze([...(props.requiredRoles ?? [])]);
    this.requiredPermissions = Object.freeze([...(props.requiredPermissions ?? [])]);
    this.tenantId = props.tenantId ?? null;
    this.resourceId = props.resourceId ?? null;
    this.attributes = Object.freeze({ ...(props.attributes ?? {}) });
    this.metadata = Object.freeze({ ...(props.metadata ?? {}) });
  }

  public hasRequirements(): boolean {
    return this.requiredRoles.length > 0 || this.requiredPermissions.length > 0;
  }
}
