/**
 * Controlled Public API Boundary Contract
 * Bounded Context: Identity & Access Management
 * Feature Slice: Authentication / Login (modules/identity/authentication)
 *
 * External application modules MUST import authentication contracts exclusively
 * through this top-level public API boundary. Deep imports into internal files
 * are strictly forbidden by architectural governance rules.
 */

// 1. Export Validation Schema & Types
export { loginSchema } from './domain/login.schema';
export type { LoginCredentialsInput } from './domain/login.schema';
export type {
  CurrentUser,
  LoginCredentials,
  LoginRequest,
  LoginResponse,
  LoginResult,
  LoginState,
} from './domain/login.types';

// 2. Export API Fetchers & Mutation Hooks
export { executeLogin } from './api/login-api';
export { sanitizeRedirectPath, useLoginMutation } from './api/use-login-mutation';
export type { UseLoginMutationReturn } from './api/use-login-mutation';

// 3. Export Form State Hooks & Helpers
export { mapAuthErrorMessage, useLoginForm } from './hooks/use-login-form';
export type { UseLoginFormReturn } from './hooks/use-login-form';

// 4. Export UI Components & Route Contracts
export { LoginView } from './components/login-view';
export type { LoginViewProps } from './components/login-view';
export { LoginRoute } from './routes/login-route';
export type { LoginRouteProps } from './routes/login-route';
