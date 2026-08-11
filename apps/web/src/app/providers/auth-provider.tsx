import React, { createContext, useContext } from 'react';
import type {
  AuthContextState,
  AuthProviderProps,
  AuthUser,
} from '../../modules/auth/domain/auth-state.types';
import { useAuthState } from '../../modules/auth/hooks/use-auth-state';

export type { AuthUser, AuthContextState, AuthProviderProps };

const AuthContext = createContext<AuthContextState | undefined>(undefined);

/**
 * Named context for React DevTools — surfaces as "AuthContext" in the component tree.
 * Makes auth state transitions trivially inspectable during development.
 */
AuthContext.displayName = 'AuthContext';

/**
 * Master Authentication Provider (`app/providers/auth-provider.tsx`)
 *
 * The **single owner** of frontend authentication state.
 *
 * Ownership:
 * - Current user (`AuthUser`)
 * - Authentication status (`AuthStatus` state machine)
 * - Bootstrap lifecycle (silent refresh on mount)
 * - Authentication transitions (login / logout)
 *
 * Does NOT own:
 * - HTTP transport (→ `shared/api/http-client`)
 * - JWT decoding (→ `shared/auth/auth-transport`)
 * - Toast / notification rendering (→ `app/providers/notification-provider`)
 * - Business authorization rules (→ individual feature modules)
 *
 * @example
 * ```tsx
 * <AuthProvider>
 *   <App />
 * </AuthProvider>
 * ```
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  initialSessionOverride,
  skipBootstrap,
}) => {
  const authState = useAuthState(initialSessionOverride, skipBootstrap);

  return <AuthContext.Provider value={authState}>{children}</AuthContext.Provider>;
};

AuthProvider.displayName = 'AuthProvider';

/**
 * `useAuth` — Primary consumer hook for the AuthProvider context.
 *
 * Returns the typed `AuthContextState` including:
 * - `status` — Explicit `AuthStatus` state machine value
 * - `currentUser` — `AuthUser | null` (non-null only when authenticated)
 * - `isAuthenticated`, `isBootstrapping`, `isUnauthenticated` — Convenience flags
 * - `login`, `logout`, `retryBootstrap` — State transition actions
 * - `hasPermission`, `hasRole` — Fine-grained authorization predicates
 *
 * @throws {Error} When called outside of an `<AuthProvider>` boundary
 *
 * @example
 * ```tsx
 * const { currentUser, isAuthenticated, logout } = useAuth();
 * ```
 */
export const useAuth = (): AuthContextState => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
