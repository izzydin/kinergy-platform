import type { ApiError } from '../../../../shared/api/api-error';
import type { AuthUser } from '../../../auth/domain/auth-state.types';
import type { LoginCredentialsInput } from './login.schema';

/**
 * Login Credentials Request Payload (`LoginRequest`)
 *
 * Matches backend `LoginDto` contract (`POST /api/v1/auth/login`).
 * Contains strictly authentication credentials. Excludes roles, permissions, or profile details.
 */
export type LoginRequest = LoginCredentialsInput;

/**
 * Backward compatibility alias for LoginRequest
 */
export type LoginCredentials = LoginRequest;

/**
 * Minimal Current User Profile Aggregate (`CurrentUser`)
 *
 * Returned by backend authentication response and `/auth/me`.
 * Contains only identity summary required by authentication context.
 */
export interface CurrentUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly roles: readonly string[];
  readonly permissions: readonly string[];
  readonly tenantId?: string | null;
}

/**
 * Backend Authentication API Response Envelope (`LoginResponse`)
 *
 * Matches NestJS `AuthenticationResponse` DTO returned by `POST /api/v1/auth/login`.
 */
export interface LoginResponse {
  readonly accessToken: string;
  readonly tokenType: string;
  readonly expiresIn: number;
  readonly user: CurrentUser;
}

/**
 * Canonical Login UI States
 *
 * Represents the 6 explicit supported UI presentation states:
 * - INITIAL: Form mounted and pristine
 * - VALIDATION_ERROR: Client-side Zod schema validation failure
 * - SUBMITTING: Network mutation in-flight (loading state)
 * - AUTHENTICATION_ERROR: Invalid credentials or blocked account (401 Unauthorized)
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
  readonly user: AuthUser | CurrentUser | null;
  readonly redirectPath: string;
  readonly error: ApiError | null;
}
