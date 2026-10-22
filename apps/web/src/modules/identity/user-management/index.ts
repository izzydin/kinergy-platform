// Register User Management Feature Module Route Contract and Nav Entry
import './routes/user-management-router';

// Views & Sub-Router
export { UserManagementSubRouter } from './routes/user-management-router';
export { UserListPage } from './views/user-list-page';

// Hooks
export { useUserFilters } from './hooks/use-user-filters';

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

// Pure Fixtures
export { MOCK_MANAGED_USERS } from './mocks/user-management-fixtures';
