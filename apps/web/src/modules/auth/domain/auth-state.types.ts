/**
 * Canonical Authentication Status Model
 * Scope: Authentication Feature Domain (modules/auth)
 */
export type AuthStatus =
  'BOOTSTRAPPING' | 'AUTHENTICATED' | 'UNAUTHENTICATED' | 'AUTHENTICATION_ERROR';

/**
 * Authenticated User Session View Model
 */
export interface UserSession {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly tenantId?: string;
}

export const DEFAULT_DEV_USER: UserSession = {
  id: 'usr-dev-123',
  email: 'operator@kinergy.io',
  name: 'Enterprise Operator',
  roles: ['OPERATOR'],
  permissions: ['client:read', 'energy:read', 'analytics:read'],
  tenantId: 'tenant_default',
};

/**
 * Internal Authentication Domain State
 */
export interface AuthState {
  readonly status: AuthStatus;
  readonly session: UserSession | null;
  readonly error: Error | null;
}

/**
 * Public Authentication Context Contract
 */
export interface AuthContextState {
  readonly status: AuthStatus;
  readonly session: UserSession | null;
  readonly isAuthenticated: boolean;
  readonly isBootstrapping: boolean;
  readonly isUnauthenticated: boolean;
  readonly error: Error | null;
  readonly login: (credentials?: Record<string, unknown>) => Promise<void>;
  readonly logout: () => Promise<void>;
  readonly retryBootstrap: () => Promise<void>;
  readonly hasPermission: (permission: string) => boolean;
  readonly hasRole: (role: string) => boolean;
}

/**
 * AuthProvider Component Props
 */
export interface AuthProviderProps {
  readonly children: React.ReactNode;
  readonly initialSessionOverride?: UserSession | null;
  readonly skipBootstrap?: boolean;
}
