/**
 * User Management Module Public API Entry Point
 *
 * Enforces strict feature module boundaries. External modules must import ONLY
 * from this index file rather than internal module paths.
 */

// Domain Types
export type {
  CreateUserDTO,
  ManagedUser,
  PaginatedUsersResponse,
  UpdateUserDTO,
  UserListParams,
  UserRole,
  UserStatus,
} from './domain/user.types';

// Zod Schemas
export {
  createUserSchema,
  updateUserSchema,
  userRoleEnum,
  userStatusEnum,
  type CreateUserFormValues,
  type UpdateUserFormValues,
} from './schemas/user-form.schema';

// API Transport Functions
export {
  activateUser,
  createUser,
  deactivateUser,
  fetchUserById,
  fetchUsers,
  updateUser,
} from './api/user-management-api';

// TanStack Query Hooks & Keys
export {
  userManagementKeys,
  useActivateUserMutation,
  useCreateUserMutation,
  useDeactivateUserMutation,
  useUpdateUserMutation,
  useUserQuery,
  useUsersQuery,
} from './api/user-management-queries';

// MSW Handlers & Fixtures
export { MOCK_MANAGED_USERS, userManagementHandlers } from './mocks/user-management-handlers';
