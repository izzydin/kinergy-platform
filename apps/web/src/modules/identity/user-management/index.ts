import { moduleRegistry } from '../../../app/routes/module-registry';
import { UserManagementSubRouter } from './routes/user-management-router';

// Register User Management Feature Module Contract with central router shell
moduleRegistry.register({
  id: 'user-management',
  prefix: '/admin/users',
  title: 'User Management',
  isProtected: true,
  requiredPermissions: ['manage:users'],
  component: UserManagementSubRouter,
});

// Components
export { UserFilterBar } from './components/user-filter-bar';
export { UserFormDialog } from './components/user-form-dialog';
export { UserEditDialog } from './components/user-edit-dialog';
export { UserListTable } from './components/user-list-table';
export { UserStatusBadge } from './components/user-status-badge';

// Views & Router
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
