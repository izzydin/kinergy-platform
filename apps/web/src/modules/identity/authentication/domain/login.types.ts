import type { ApiError } from '../../../../shared/api/api-error';
import type { AuthUser } from '../../../auth/domain/auth-state.types';
import type { LoginCredentialsInput } from './login.schema';

/**
 * Validated credential input payload required for authentication
 */
export type LoginCredentials = LoginCredentialsInput;

/**
 * Backend API response payload structure returned by `POST /api/v1/auth/login`
 */
export interface LoginResponse {
  readonly accessToken: string;
  readonly expiresIn?: number;
  readonly user?: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
    readonly roles: readonly string[];
    readonly permissions: readonly string[];
    readonly tenantId?: string;
  };
}

/**
 * Canonical Login UI States
 *
 * Represents the 6 explicit supported UI presentation states:
 * - INITIAL: Form mounted and pristine
 * - VALIDATION_ERROR: Client-side Zod schema validation failure
 * - SUBMITTING: Network mutation in-flight (loading state)
 * - AUTHENTICATION_ERROR: Invalid credentials (401 Unauthorized)
 * - NETWORK_ERROR: Infrastructure / gateway error (500 / 429 / offline)
 * - SUCCESS: Authentication confirmed, transitioning to protected route
 */
export type LoginState =
  | 'INITIAL'
  | 'VALIDATION_ERROR'
  | 'SUBMITTING'
  | 'AUTHENTICATION_ERROR'
  | 'NETWORK_ERROR'
  | 'SUCCESS';

/**
 * Result object returned upon completion of the login mutation
 */
export interface LoginResult {
  readonly success: boolean;
  readonly user: AuthUser | null;
  readonly redirectPath: string;
  readonly error: ApiError | null;
}
