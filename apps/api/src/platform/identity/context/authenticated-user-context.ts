export interface AuthenticatedUserContextProps {
  userId: string;
  email: string;
  status: string;
  roles: string[];
  permissions: string[];
  tenantId?: string | null;
  organizationId?: string | null;
  deviceId?: string | null;
  locale?: string | null;
  timezone?: string | null;
  isImpersonating?: boolean;
  featureFlags?: Record<string, boolean>;
  metadata?: Record<string, unknown>;
}

/**
 * Unified, immutable Authenticated User Security Context model.
 * Encapsulates identity, authorization claims, tenant boundaries, and request metadata.
 * Application services and controllers consume this model instead of decoding raw JWT claims.
 */
export class AuthenticatedUserContext {
  public readonly userId: string;
  public readonly email: string;
  public readonly status: string;
  public readonly roles: ReadonlyArray<string>;
  public readonly permissions: ReadonlyArray<string>;
  public readonly tenantId: string | null;
  public readonly organizationId: string | null;
  public readonly deviceId: string | null;
  public readonly locale: string | null;
  public readonly timezone: string | null;
  public readonly isImpersonating: boolean;
  public readonly featureFlags: Readonly<Record<string, boolean>>;
  public readonly metadata: Readonly<Record<string, unknown>>;
  public readonly isAuthenticated: boolean = true;

  constructor(props: AuthenticatedUserContextProps) {
    this.userId = props.userId;
    this.email = props.email;
    this.status = props.status;
    this.roles = Object.freeze([...(props.roles ?? [])]);
    this.permissions = Object.freeze([...(props.permissions ?? [])]);
    this.tenantId = props.tenantId ?? null;
    this.organizationId = props.organizationId ?? null;
    this.deviceId = props.deviceId ?? null;
    this.locale = props.locale ?? null;
    this.timezone = props.timezone ?? null;
    this.isImpersonating = props.isImpersonating ?? false;
    this.featureFlags = Object.freeze({ ...(props.featureFlags ?? {}) });
    this.metadata = Object.freeze({ ...(props.metadata ?? {}) });
  }

  public get id(): string {
    return this.userId;
  }

  public hasRole(role: string): boolean {
    return this.roles.includes(role) || this.roles.includes('ADMIN');
  }

  public hasAnyRole(roles: string[]): boolean {
    return roles.some((role) => this.hasRole(role));
  }

  public hasPermission(permission: string): boolean {
    if (this.permissions.includes('*') || this.permissions.includes(permission)) {
      return true;
    }
    return this.permissions.some((perm) => {
      if (perm.endsWith(':*')) {
        const prefix = perm.slice(0, -2);
        return permission.startsWith(prefix);
      }
      return false;
    });
  }

  public hasAllPermissions(permissions: string[]): boolean {
    return permissions.every((perm) => this.hasPermission(perm));
  }
}
