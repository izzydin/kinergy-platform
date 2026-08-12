import React from 'react';
import { LoginView } from '../components/login-view';

export interface LoginRouteProps {
  /** Optional completion callback triggered after successful login */
  readonly onSuccess?: () => void;
}

/**
 * Login Feature Route Contract Boundary (`/auth/login`)
 *
 * Serves as the primary route boundary component for user authentication within the Identity bounded context.
 * Mounts `LoginView` UI component and accepts optional completion callbacks.
 */
export const LoginRoute: React.FC<LoginRouteProps> = ({ onSuccess }) => {
  return <LoginView onSuccess={onSuccess} />;
};

LoginRoute.displayName = 'LoginRoute';

export default LoginRoute;
