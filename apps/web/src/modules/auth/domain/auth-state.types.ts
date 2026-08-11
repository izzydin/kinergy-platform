/**
 * Canonical Authentication Status Model
 * Scope: Authentication Feature Domain (modules/auth)
 */
export type AuthStatus =
  'BOOTSTRAPPING' | 'AUTHENTICATED' | 'UNAUTHENTICATED' | 'AUTHENTICATION_ERROR';

/**
 * Backend User Session API Response Shape
 *
 * Represents the raw payload returned by `/api/v1/auth/me`.
 * Used internally by the auth API layer (`auth-api.ts`) and the state machine.
 * Do NOT expose this type directly in the public auth context API.
 */
export interface UserSession {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly tenantId?: string;
}

/**
 * Application-Level Current User Model (`AuthUser`)
 *
 * The canonical frontend identity representation exposed through the auth context.
 * This is the only identity shape consumers should reference.
 *
 * Design rationale:
 * - Decoupled from the backend `UserSession` API response — future additions to
 *   `UserSession` (e.g. business profile fields) will NOT automatically propagate here.
 * - Contains only the fields required by frontend authentication context consumers.
 * - Never exposes raw tokens, secrets, or backend-internal metadata.
 */
export interface AuthUser {
  /** Unique user identifier */
  readonly id: string;
  /** Verified primary email address */
  readonly email: string;
  /** Display name for UI rendering */
  readonly name: string;
  /** Assigned role identifiers for coarse-grained access control */
  readonly roles: readonly string[];
  /** Fine-grained permission identifiers for route/feature guards */
  readonly permissions: readonly string[];
  /** Tenant scope identifier (present in multi-tenant deployments) */
  readonly tenantId?: string;
}

export const DEFAULT_DEV_USER: AuthUser = {
  id: 'usr-dev-123',
  email: 'operator@kinergy.io',
  name: 'Enterprise Operator',
  roles: ['OPERATOR'],
  permissions: ['client:read', 'energy:read', 'analytics:read'],
  tenantId: 'tenant_default',
};

/**
 * Internal Authentication Domain State
 *
 * Private to the `useAuthState` hook. Never leaked through context.
 */
export interface AuthState {
  readonly status: AuthStatus;
  readonly session: AuthUser | null;
  readonly error: Error | null;
}

/**
 * Public Authentication Context Contract
 *
 * The typed API surface exposed to all auth context consumers via `useAuth()`.
 * Designed to be minimal — only what downstream consumers genuinely need.
 *
 * Ownership boundaries:
 * - Owns: auth status, current user, bootstrap lifecycle, logout, helper predicates
 * - Does NOT own: HTTP transport, JWT decoding, toast rendering, business authorization
 */
export interface AuthContextState {
  /** Current state machine status */
  readonly status: AuthStatus;
  /** Authenticated user identity. Null when not authenticated. */
  readonly currentUser: AuthUser | null;
  /** True only when `status === 'AUTHENTICATED'` */
  readonly isAuthenticated: boolean;
  /** True while the initial silent refresh bootstrap is in-flight */
  readonly isBootstrapping: boolean;
  /** True when the user is definitively unauthenticated */
  readonly isUnauthenticated: boolean;
  /** Non-null only in `AUTHENTICATION_ERROR` state */
  readonly error: Error | null;
  /**
   * Signals a successful external login completion.
   * Fetches the current user profile and transitions to `AUTHENTICATED`.
   */
  readonly login: (credentials?: Record<string, unknown>) => Promise<void>;
  /** Executes server logout, clears in-memory tokens, and transitions to `UNAUTHENTICATED` */
  readonly logout: () => Promise<void>;
  /** Re-runs the full bootstrap sequence from `AUTHENTICATION_ERROR` state */
  readonly retryBootstrap: () => Promise<void>;
  /** Returns true if the current user holds the specified fine-grained permission */
  readonly hasPermission: (permission: string) => boolean;
  /** Returns true if the current user holds the specified role */
  readonly hasRole: (role: string) => boolean;
}

/**
 * AuthProvider Component Props
 */
export interface AuthProviderProps {
  readonly children: React.ReactNode;
  /**
   * Bypasses bootstrap and initializes with this user (or `null` for unauthenticated).
   * Intended for testing and Storybook only.
   */
  readonly initialSessionOverride?: AuthUser | null;
  /**
   * Skips the async bootstrap and resolves immediately with the default dev user.
   * Intended for local development only.
   */
  readonly skipBootstrap?: boolean;
}
