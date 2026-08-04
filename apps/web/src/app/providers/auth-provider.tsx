import React, { createContext, useContext, useState } from 'react';

export interface UserSession {
  id: string;
  email: string;
  name: string;
  roles: string[];
  permissions: string[];
  tenantId?: string;
}

export interface AuthContextState {
  session: UserSession | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials?: Record<string, unknown>) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

const initialSession: UserSession = {
  id: 'usr_dev_123',
  email: 'operator@kinergy.io',
  name: 'Enterprise Operator',
  roles: ['OPERATOR'],
  permissions: ['client:read', 'energy:read', 'analytics:read'],
  tenantId: 'tenant_default',
};

const AuthContext = createContext<AuthContextState | undefined>(undefined);

export interface AuthProviderProps {
  children: React.ReactNode;
  initialSessionOverride?: UserSession | null;
}

/**
 * Authentication Provider Placeholder Component
 *
 * Infrastructure placeholder for future identity context and authentication state.
 * Does NOT implement business login logic; provides contract and hook for consumption.
 */
export const AuthProvider: React.FC<AuthProviderProps> = ({
  children,
  initialSessionOverride = initialSession,
}) => {
  const [session, setSession] = useState<UserSession | null>(initialSessionOverride);
  const [isLoading] = useState<boolean>(false);

  const login = async (): Promise<void> => {
    // Placeholder login contract
    setSession(initialSession);
  };

  const logout = async (): Promise<void> => {
    // Placeholder logout contract
    setSession(null);
  };

  const hasPermission = (permission: string): boolean => {
    if (!session) return false;
    return session.permissions.includes(permission);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        isAuthenticated: !!session,
        isLoading,
        login,
        logout,
        hasPermission,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
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
