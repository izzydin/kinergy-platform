import React, { createContext, useContext } from 'react';
import type {
  AuthContextState,
  AuthProviderProps,
  UserSession,
} from '../../modules/auth/domain/auth-state.types';
import { useAuthState } from '../../modules/auth/hooks/use-auth-state';

export type { UserSession, AuthContextState, AuthProviderProps };

const AuthContext = createContext<AuthContextState | undefined>(undefined);

/**
 * Master Authentication Provider Component
 *
 * Provides application-wide identity context, canonical `AuthStatus` state machine,
 * and silent refresh bootstrap execution.
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  initialSessionOverride,
  skipBootstrap,
}) => {
  const authState = useAuthState(initialSessionOverride, skipBootstrap);

  return <AuthContext.Provider value={authState}>{children}</AuthContext.Provider>;
};

/**
 * Custom Hook to access Authentication Context
 */
export const useAuth = (): AuthContextState => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
