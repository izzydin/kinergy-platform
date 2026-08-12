import React, { useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { sanitizeRedirectPath } from '../api/use-login-mutation';
import { LoginView } from '../components/login-view';

export interface LoginRouteProps {
  /** Optional completion callback triggered after successful login */
  readonly onSuccess?: () => void;
}

/**
 * Login Feature Route Contract Boundary (`/auth/login`)
 *
 * Serves as the primary route boundary component for user authentication within the Identity bounded context:
 * - Mounts `LoginView` UI presentation component.
 * - Handles post-authentication navigation at the application feature boundary.
 * - Respects preserved return location (`?redirect=/clients` -> `/clients` upon success).
 * - Sanitizes target paths against open redirect vulnerabilities.
 */
export const LoginRoute: React.FC<LoginRouteProps> = ({ onSuccess }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handleSuccess = useCallback(() => {
    if (onSuccess) {
      onSuccess();
    } else {
      const redirectParam = searchParams.get('redirect');
      const targetPath = sanitizeRedirectPath(redirectParam);
      navigate(targetPath, { replace: true });
    }
  }, [navigate, onSuccess, searchParams]);

  return <LoginView onSuccess={handleSuccess} />;
};

LoginRoute.displayName = 'LoginRoute';

export default LoginRoute;
