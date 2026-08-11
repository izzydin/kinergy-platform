import React from 'react';
import { PlaceholderView } from '../../../../app/routes/fallback-views';

export interface LoginRouteProps {
  /** Optional completion callback triggered after successful login */
  readonly onSuccess?: () => void;
}

/**
 * Login Feature Route Contract Boundary
 *
 * Exposes the route view contract for `/auth/login` within the Identity bounded context.
 * In Step B1.0 (Architecture & Contract Phase), this component defines the route contract
 * boundary ready for UI form mounting in Step B1.1.
 */
export const LoginRoute: React.FC<LoginRouteProps> = () => {
  return (
    <PlaceholderView
      title="Login Architectural Boundary"
      subtitle="Identity Bounded Context — Authentication Route (/auth/login)"
    />
  );
};

LoginRoute.displayName = 'LoginRoute';

export default LoginRoute;
