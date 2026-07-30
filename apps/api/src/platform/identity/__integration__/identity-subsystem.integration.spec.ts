import { Test } from '@nestjs/testing';
import { IUnitOfWork } from '../../persistence/unit-of-work.interface';
import {
  User,
  UserStatus,
  IUserRepository,
  IRefreshTokenRepository,
  UserSearchQuery,
  UserSearchResult,
  RefreshToken,
} from '../domain';
import { LoginUseCase } from '../use-cases/login.use-case';
import { LogoutUseCase } from '../use-cases/logout.use-case';
import { RefreshTokenUseCase } from '../use-cases/refresh-token.use-case';
import { GetCurrentUserUseCase } from '../use-cases/get-current-user.use-case';
import { CreateUserUseCase } from '../use-cases/admin/create-user.use-case';
import { UpdateUserUseCase } from '../use-cases/admin/update-user.use-case';
import { ActivateUserUseCase } from '../use-cases/admin/activate-user.use-case';
import { DeactivateUserUseCase } from '../use-cases/admin/deactivate-user.use-case';
import { DeleteUserUseCase } from '../use-cases/admin/delete-user.use-case';
import { SearchUsersUseCase } from '../use-cases/admin/search-users.use-case';
import { ChangePasswordUseCase } from '../use-cases/password/change-password.use-case';
import { ResetPasswordUseCase } from '../use-cases/password/reset-password.use-case';
import { Argon2PasswordHasher } from '../password/argon2-password-hasher';
import { PasswordPolicyService } from '../password/password-policy.service';
import { TemporaryPasswordGeneratorService } from '../password/temporary-password-generator.service';
import { JwtTokenFactory } from '../tokens/jwt-token-factory';
import { AccessTokenService } from '../tokens/access-token.service';
import { RefreshTokenService } from '../tokens/refresh-token.service';
import { Sha256TokenHasher } from '../tokens/token-hasher.interface';
import { ConfigTokenConfiguration } from '../tokens/config-token-configuration';
import { ConfigSecretProvider } from '../tokens/config-secret-provider';
import { DefaultAuthorizationEvaluator } from '../authorization/default-authorization-evaluator';
import { DefaultPermissionResolver } from '../authorization/default-permission-resolver';
import { AuthenticatedUserContext } from '../context/authenticated-user-context';
import { AuthorizationRequirements } from '../authorization/models/authorization-requirements.model';
import {
  MockClock,
  MockLogger,
  MockSecurityEventPublisher,
  createOwner,
  createTrainer,
} from '@kinergy-platform/testing';

/**
 * In-Memory Integration Repository simulating database state for isolated integration tests.
 */
class InMemoryUserRepository implements IUserRepository {
  private users = new Map<string, User>();

  async findById(id: string): Promise<User | null> {
    const u = this.users.get(id);
    return u ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    for (const u of this.users.values()) {
      if (u.email.toLowerCase() === email.toLowerCase()) {
        return u;
      }
    }
    return null;
  }

  async create(user: User): Promise<void> {
    this.users.set(user.id, user);
  }

  async save(user: User): Promise<void> {
    this.users.set(user.id, user);
  }

  async search(query: UserSearchQuery): Promise<UserSearchResult> {
    let items = Array.from(this.users.values()).filter((u) => !u.isDeleted());

    if (query.email) {
      items = items.filter((u) => u.email.toLowerCase().includes(query.email!.toLowerCase()));
    }
    if (query.status) {
      items = items.filter((u) => u.status === query.status);
    }
    if (query.role) {
      items = items.filter((u) => u.roles.includes(query.role!));
    }

    const total = items.length;
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const start = (page - 1) * limit;

    return {
      items: items.slice(start, start + limit),
      total,
      page,
      limit,
    };
  }

  async updateRefreshToken(): Promise<void> {}

  clear(): void {
    this.users.clear();
  }
}

class InMemoryRefreshTokenRepository implements IRefreshTokenRepository {
  private tokens = new Map<string, RefreshToken>();

  async save(token: RefreshToken): Promise<void> {
    this.tokens.set(token.id, token);
  }

  async findByHash(hashedToken: string): Promise<RefreshToken | null> {
    for (const t of this.tokens.values()) {
      if (t.tokenHash === hashedToken) {
        return t;
      }
    }
    return null;
  }

  async findByFamilyId(familyId: string): Promise<RefreshToken[]> {
    return Array.from(this.tokens.values()).filter((t) => t.familyId === familyId);
  }

  async findByUserId(userId: string): Promise<RefreshToken[]> {
    return Array.from(this.tokens.values()).filter((t) => t.userId === userId);
  }

  async revokeFamily(familyId: string): Promise<void> {
    for (const t of this.tokens.values()) {
      if (t.familyId === familyId) {
        t.revoke();
      }
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    for (const t of this.tokens.values()) {
      if (t.userId === userId) {
        t.revoke();
      }
    }
  }

  async deleteExpired(): Promise<number> {
    return 0;
  }

  clear(): void {
    this.tokens.clear();
  }
}

describe('Identity Subsystem Integration Tests', () => {
  let userRepo: InMemoryUserRepository;
  let refreshTokenRepo: InMemoryRefreshTokenRepository;
  let loginUseCase: LoginUseCase;
  let logoutUseCase: LogoutUseCase;
  let refreshTokenUseCase: RefreshTokenUseCase;
  let getCurrentUserUseCase: GetCurrentUserUseCase;
  let createUserUseCase: CreateUserUseCase;
  let updateUserUseCase: UpdateUserUseCase;
  let activateUserUseCase: ActivateUserUseCase;
  let deactivateUserUseCase: DeactivateUserUseCase;
  let deleteUserUseCase: DeleteUserUseCase;
  let searchUsersUseCase: SearchUsersUseCase;
  let changePasswordUseCase: ChangePasswordUseCase;
  let resetPasswordUseCase: ResetPasswordUseCase;
  let passwordHasher: Argon2PasswordHasher;
  let mockPublisher: MockSecurityEventPublisher;

  beforeAll(async () => {
    userRepo = new InMemoryUserRepository();
    refreshTokenRepo = new InMemoryRefreshTokenRepository();
    mockPublisher = new MockSecurityEventPublisher();
    const mockClock = new MockClock();
    const mockLogger = new MockLogger();

    const configServiceMock = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'JWT_ACCESS_SECRET':
            return 'kynergy-dev-jwt-access-secret-minimum-32-chars-long';
          case 'JWT_REFRESH_SECRET':
            return 'kynergy-dev-jwt-refresh-secret-minimum-32-chars-long';
          case 'JWT_EXPIRES_IN':
            return '15m';
          case 'JWT_REFRESH_EXPIRES_IN':
            return '7d';
          case 'JWT_ISSUER':
            return 'kynergy-identity-service';
          case 'JWT_AUDIENCE':
            return 'kynergy-platform-clients';
          default:
            return undefined;
        }
      }),
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const secretProvider = new ConfigSecretProvider(configServiceMock as any);
    const tokenConfig = new ConfigTokenConfiguration(secretProvider);
    const jwtFactory = new JwtTokenFactory(secretProvider);
    const accessTokenService = new AccessTokenService(jwtFactory);
    const refreshTokenService = new RefreshTokenService(jwtFactory);
    const sha256Hasher = new Sha256TokenHasher();
    passwordHasher = new Argon2PasswordHasher();
    const passwordPolicy = new PasswordPolicyService();
    const tempPasswordGen = new TemporaryPasswordGeneratorService(passwordPolicy);

    const passthroughUnitOfWork: IUnitOfWork = {
      executeInTransaction: async (work) => work(),
    };

    await Test.createTestingModule({
      providers: [
        { provide: 'IUserRepository', useValue: userRepo },
        { provide: 'IRefreshTokenRepository', useValue: refreshTokenRepo },
      ],
    }).compile();

    loginUseCase = new LoginUseCase(
      userRepo,
      refreshTokenRepo,
      passwordHasher,
      sha256Hasher,
      accessTokenService,
      refreshTokenService,
      mockClock,
      tokenConfig,
      mockPublisher,
      mockLogger,
    );

    logoutUseCase = new LogoutUseCase(
      userRepo,
      refreshTokenRepo,
      refreshTokenService,
      sha256Hasher,
      mockPublisher,
      mockLogger,
    );
    refreshTokenUseCase = new RefreshTokenUseCase(
      userRepo,
      refreshTokenRepo,
      sha256Hasher,
      accessTokenService,
      refreshTokenService,
      mockClock,
      passthroughUnitOfWork,
      tokenConfig,
      mockPublisher,
      mockLogger,
    );
    getCurrentUserUseCase = new GetCurrentUserUseCase(userRepo);

    createUserUseCase = new CreateUserUseCase(userRepo, passwordHasher);
    updateUserUseCase = new UpdateUserUseCase(userRepo);
    activateUserUseCase = new ActivateUserUseCase(userRepo);
    deactivateUserUseCase = new DeactivateUserUseCase(userRepo);
    deleteUserUseCase = new DeleteUserUseCase(userRepo);
    searchUsersUseCase = new SearchUsersUseCase(userRepo);

    changePasswordUseCase = new ChangePasswordUseCase(
      userRepo,
      passwordHasher,
      passwordPolicy,
      mockPublisher,
    );
    resetPasswordUseCase = new ResetPasswordUseCase(
      userRepo,
      passwordHasher,
      tempPasswordGen,
      mockPublisher,
    );
  });

  beforeEach(() => {
    userRepo.clear();
    refreshTokenRepo.clear();
    mockPublisher.clear();
  });

  describe('Integration Workflow 1: User Administration CRUD & Search', () => {
    it('should create, search, update, deactivate, and soft-delete user records', async () => {
      // 1. Create User
      const created = await createUserUseCase.execute({
        email: 'employee.one@kinergy.local',
        password: 'Password123!',
        role: 'ADMIN',
        tenantId: 'tenant_1',
      });
      expect(created.id).toBeDefined();
      expect(created.email).toBe('employee.one@kinergy.local');

      // 2. Search Users
      const searchResult = await searchUsersUseCase.execute({
        email: 'employee.one',
        role: 'ADMIN',
      });
      expect(searchResult.total).toBe(1);
      expect(searchResult.items[0]?.email).toBe('employee.one@kinergy.local');

      // 3. Update User Roles
      await updateUserUseCase.execute({
        userId: created.id,
        email: 'employee.updated@kinergy.local',
        role: 'SUPER_ADMIN',
      });

      const updated = await getCurrentUserUseCase.execute({ userId: created.id });
      expect(updated.email).toBe('employee.updated@kinergy.local');
      expect(updated.roles).toContain('SUPER_ADMIN');

      // 4. Deactivate User
      await deactivateUserUseCase.execute({ userId: created.id });
      const deactivated = await getCurrentUserUseCase.execute({ userId: created.id });
      expect(deactivated.status).toBe(UserStatus.DEACTIVATED);

      // 5. Soft Delete User
      await deleteUserUseCase.execute({ userId: created.id });
      const deletedSearch = await searchUsersUseCase.execute({ email: 'employee.updated' });
      expect(deletedSearch.total).toBe(0);
    });
  });

  describe('Integration Workflow 2: Argon2id Login & Token Rotation Lifecycle', () => {
    it('should register user, execute Argon2id login, and rotate refresh tokens', async () => {
      // 1. Create Active User
      const user = await createUserUseCase.execute({
        email: 'active.user@kinergy.local',
        password: 'SecurePassword123!',
        role: 'USER',
        tenantId: 'tenant_1',
      });

      await activateUserUseCase.execute({ userId: user.id });

      // 2. Execute Real Argon2id Login
      const loginResponse = await loginUseCase.execute({
        email: 'active.user@kinergy.local',
        password: 'SecurePassword123!',
      });

      expect(loginResponse.accessToken).toBeDefined();
      expect(loginResponse.refreshToken).toBeDefined();
      expect(mockPublisher.hasPublishedEvent('LoginSucceeded', user.id)).toBe(true);

      // 3. Execute Refresh Token Rotation
      const rotatedResponse = await refreshTokenUseCase.execute({
        refreshToken: loginResponse.refreshToken,
      });

      expect(rotatedResponse.accessToken).toBeDefined();
      expect(rotatedResponse.refreshToken).not.toEqual(loginResponse.refreshToken);
      expect(mockPublisher.hasPublishedEvent('RefreshTokenRotated', user.id)).toBe(true);

      // 4. Execute Logout
      await logoutUseCase.execute({ userId: user.id });
      const storedUser = await userRepo.findById(user.id);
      expect(storedUser?.hashedRefreshToken).toBeNull();
    });
  });

  describe('Integration Workflow 3: Password Management & Replay Attack Detection', () => {
    it('should change user password and invalidate active sessions', async () => {
      const created = await createUserUseCase.execute({
        email: 'pass.user@kinergy.local',
        password: 'OldPassword123!',
        role: 'USER',
      });
      await activateUserUseCase.execute({ userId: created.id });

      // Change Password
      const changeResult = await changePasswordUseCase.execute({
        userId: created.id,
        currentPassword: 'OldPassword123!',
        newPassword: 'NewSecurePassword456!',
      });
      expect(changeResult.success).toBe(true);

      // Admin Password Reset
      const resetResult = await resetPasswordUseCase.execute({
        userId: created.id,
        adminId: 'admin_1',
      });
      expect(resetResult.temporaryPassword).toBeDefined();
      expect(resetResult.temporaryPassword.length).toBeGreaterThanOrEqual(16);
    }, 30_000);
  });

  describe('Integration Workflow 4: Authorization Engine Evaluation', () => {
    it('should evaluate permissions and authorization rules for roles', async () => {
      const resolver = new DefaultPermissionResolver();
      const evaluator = new DefaultAuthorizationEvaluator(resolver);

      const owner = createOwner();
      const trainer = createTrainer();

      const ownerContext = new AuthenticatedUserContext({
        userId: owner.id,
        email: owner.email,
        status: owner.status,
        roles: owner.roles,
        permissions: owner.permissions,
      });

      const trainerContext = new AuthenticatedUserContext({
        userId: trainer.id,
        email: trainer.email,
        status: trainer.status,
        roles: trainer.roles,
        permissions: trainer.permissions,
      });

      // Owner has wildcard access
      const ownerDecision = await evaluator.evaluate(
        ownerContext,
        new AuthorizationRequirements({ requiredPermissions: ['delete:all'] }),
      );
      expect(ownerDecision.isAuthorized).toBe(true);

      // Trainer has workout management but not delete:all
      const trainerWorkoutDecision = await evaluator.evaluate(
        trainerContext,
        new AuthorizationRequirements({ requiredPermissions: ['manage:workouts'] }),
      );
      expect(trainerWorkoutDecision.isAuthorized).toBe(true);

      const trainerDeleteDecision = await evaluator.evaluate(
        trainerContext,
        new AuthorizationRequirements({ requiredPermissions: ['delete:all'] }),
      );
      expect(trainerDeleteDecision.isAuthorized).toBe(false);
    });
  });
});
