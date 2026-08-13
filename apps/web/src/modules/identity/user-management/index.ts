import { navigationRegistry } from '../../../app/navigation/navigation-registry';
import { moduleRegistry } from '../../../app/routes/module-registry';
import { UserManagementSubRouter } from './routes/user-management-router';

// Register User Management Feature Module Route Contract with central router shell
moduleRegistry.register({
  id: 'user-management',
  prefix: '/admin/users',
  title: 'User Management',
  isProtected: true,
  requiredPermissions: ['manage:users'],
  component: UserManagementSubRouter,
});

// Register User Management Navigation Entry with central navigation registry
navigationRegistry.register({
  id: 'user-management',
  label: 'User Management',
  path: '/admin/users',
  order: 50,
  section: 'admin',
  requiredPermissions: ['manage:users'],
});

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
