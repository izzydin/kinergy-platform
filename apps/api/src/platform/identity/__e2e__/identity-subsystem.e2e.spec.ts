import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  INestApplication,
  HttpStatus,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
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
import { AccessTokenService, ACCESS_TOKEN_SERVICE } from '../tokens/access-token.service';
import { RefreshTokenService, REFRESH_TOKEN_SERVICE } from '../tokens/refresh-token.service';
import { Sha256TokenHasher, TOKEN_HASHER } from '../tokens/token-hasher.interface';
import { ConfigTokenConfiguration } from '../tokens/config-token-configuration';
import { ConfigSecretProvider } from '../tokens/config-secret-provider';
import { TOKEN_CONFIGURATION } from '../tokens/token-configuration.interface';
import { SECRET_PROVIDER } from '../tokens/secret-provider.interface';
import { DefaultAuthorizationEvaluator } from '../authorization/default-authorization-evaluator';
import { DefaultPermissionResolver } from '../authorization/default-permission-resolver';
import { AUTHORIZATION_EVALUATOR, PERMISSION_RESOLVER } from '../authorization';
import { AuthenticationGuard } from '../guards/authentication.guard';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { Public, Roles, Permissions, CurrentUser } from '../decorators';
import { AuthenticatedUserContext } from '../context/authenticated-user-context';
import { USER_REPOSITORY, REFRESH_TOKEN_REPOSITORY } from '../domain';
import {
  auth,
  createOwner,
  createTrainer,
  UserTestFactory,
  MockClock,
  MockLogger,
  MockSecurityEventPublisher,
} from '@kinergy-platform/testing';

/**
 * In-Memory Integration Repository simulating production database state for E2E HTTP pipeline tests.
 */
class InMemoryE2EUserRepository implements IUserRepository {
  private users = new Map<string, User>();

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
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

class InMemoryE2ERefreshTokenRepository implements IRefreshTokenRepository {
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

/**
 * Production-grade NestJS E2E Test Controllers mounting complete Identity Guards and Use Cases.
 */
@Controller('auth')
export class E2EAuthController {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
  ) {}

  @Public()
  @Post('login')
  async login(@Body() body: Record<string, unknown>) {
    return this.loginUseCase.execute(body as unknown as Parameters<LoginUseCase['execute']>[0]);
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() body: Record<string, unknown>) {
    return this.refreshTokenUseCase.execute(
      body as unknown as Parameters<RefreshTokenUseCase['execute']>[0],
    );
  }

  @UseGuards(AuthenticationGuard)
  @Post('logout')
  async logout(
    @CurrentUser() user: AuthenticatedUserContext,
    @Body() body: Record<string, unknown>,
  ) {
    return this.logoutUseCase.execute({ ...body, userId: user.userId });
  }

  @UseGuards(AuthenticationGuard)
  @Get('me')
  async getMe(@CurrentUser() user: AuthenticatedUserContext) {
    return this.getCurrentUserUseCase.execute({ userId: user.userId });
  }

  @UseGuards(AuthenticationGuard)
  @Post('change-password')
  async changePassword(
    @CurrentUser() user: AuthenticatedUserContext,
    @Body() body: Record<string, unknown>,
  ) {
    return this.changePasswordUseCase.execute({
      currentPassword: body.currentPassword as string,
      newPassword: body.newPassword as string,
      userId: user.userId,
    });
  }

  @UseGuards(AuthenticationGuard, AuthorizationGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Permissions('manage:users')
  @Post('users/:userId/reset-password')
  async resetPassword(
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.resetPasswordUseCase.execute({ userId, adminId: user.userId });
  }
}

@Controller('users')
@UseGuards(AuthenticationGuard, AuthorizationGuard)
export class E2EUsersController {
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly searchUsersUseCase: SearchUsersUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase,
    private readonly activateUserUseCase: ActivateUserUseCase,
    private readonly deactivateUserUseCase: DeactivateUserUseCase,
    private readonly deleteUserUseCase: DeleteUserUseCase,
  ) {}

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Post()
  async createUser(@Body() body: Record<string, unknown>) {
    return this.createUserUseCase.execute(
      body as unknown as Parameters<CreateUserUseCase['execute']>[0],
    );
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get()
  async searchUsers(@Query() query: Record<string, unknown>) {
    return this.searchUsersUseCase.execute(
      query as unknown as Parameters<SearchUsersUseCase['execute']>[0],
    );
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Put(':userId')
  async updateUser(@Param('userId') userId: string, @Body() body: Record<string, unknown>) {
    return this.updateUserUseCase.execute({
      ...(body as unknown as Parameters<UpdateUserUseCase['execute']>[0]),
      userId,
    });
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Patch(':userId/activate')
  async activateUser(@Param('userId') userId: string) {
    return this.activateUserUseCase.execute({ userId });
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Patch(':userId/deactivate')
  async deactivateUser(@Param('userId') userId: string) {
    return this.deactivateUserUseCase.execute({ userId });
  }

  @Roles('ADMIN', 'SUPER_ADMIN')
  @Delete(':userId')
  async deleteUser(@Param('userId') userId: string) {
    return this.deleteUserUseCase.execute({ userId });
  }
}

@Controller('test-pipeline')
@UseGuards(AuthenticationGuard, AuthorizationGuard)
export class E2ETestPipelineController {
  @Public()
  @Get('public')
  getPublic() {
    return { status: 'public_access_granted' };
  }

  @Get('protected')
  getProtected(@CurrentUser() user: AuthenticatedUserContext) {
    return {
      status: 'protected_access_granted',
      user: {
        userId: user.userId,
        email: user.email,
        roles: user.roles,
        permissions: user.permissions,
      },
    };
  }

  @Roles('OWNER')
  @Get('owner-only')
  getOwnerOnly() {
    return { status: 'owner_access_granted' };
  }

  @Permissions('delete:all')
  @Get('delete-permission')
  getDeletePermission() {
    return { status: 'delete_permission_granted' };
  }
}

describe('Identity Subsystem E2E HTTP Pipeline Tests', () => {
  let app: INestApplication;
  let userRepo: InMemoryE2EUserRepository;
  let refreshTokenRepo: InMemoryE2ERefreshTokenRepository;
  let userFactory: UserTestFactory;

  const testSecret = 'kynergy-dev-jwt-access-secret-minimum-32-chars-long';

  beforeAll(async () => {
    userRepo = new InMemoryE2EUserRepository();
    refreshTokenRepo = new InMemoryE2ERefreshTokenRepository();
    userFactory = new UserTestFactory();

    const mockPublisher = new MockSecurityEventPublisher();
    const mockClock = new MockClock();
    const mockLogger = new MockLogger();

    const configServiceMock = {
      get: jest.fn((key: string) => {
        switch (key) {
          case 'JWT_ACCESS_SECRET':
            return testSecret;
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
    const passwordHasher = new Argon2PasswordHasher();
    const passwordPolicy = new PasswordPolicyService();
    const tempPasswordGen = new TemporaryPasswordGeneratorService(passwordPolicy);

    const passthroughUnitOfWork: IUnitOfWork = {
      executeInTransaction: async (work) => work(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [E2EAuthController, E2EUsersController, E2ETestPipelineController],
      providers: [
        AuthenticationGuard,
        AuthorizationGuard,
        DefaultPermissionResolver,
        { provide: PERMISSION_RESOLVER, useClass: DefaultPermissionResolver },
        DefaultAuthorizationEvaluator,
        { provide: AUTHORIZATION_EVALUATOR, useClass: DefaultAuthorizationEvaluator },
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: REFRESH_TOKEN_REPOSITORY, useValue: refreshTokenRepo },
        { provide: ACCESS_TOKEN_SERVICE, useValue: accessTokenService },
        { provide: REFRESH_TOKEN_SERVICE, useValue: refreshTokenService },
        { provide: TOKEN_HASHER, useValue: sha256Hasher },
        { provide: TOKEN_CONFIGURATION, useValue: tokenConfig },
        { provide: SECRET_PROVIDER, useValue: secretProvider },
        {
          provide: LoginUseCase,
          useValue: new LoginUseCase(
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
          ),
        },
        {
          provide: LogoutUseCase,
          useValue: new LogoutUseCase(
            userRepo,
            refreshTokenRepo,
            refreshTokenService,
            sha256Hasher,
            mockPublisher,
            mockLogger,
          ),
        },
        {
          provide: RefreshTokenUseCase,
          useValue: new RefreshTokenUseCase(
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
          ),
        },
        {
          provide: GetCurrentUserUseCase,
          useValue: new GetCurrentUserUseCase(userRepo),
        },
        {
          provide: CreateUserUseCase,
          useValue: new CreateUserUseCase(userRepo, passwordHasher),
        },
        {
          provide: UpdateUserUseCase,
          useValue: new UpdateUserUseCase(userRepo),
        },
        {
          provide: ActivateUserUseCase,
          useValue: new ActivateUserUseCase(userRepo),
        },
        {
          provide: DeactivateUserUseCase,
          useValue: new DeactivateUserUseCase(userRepo),
        },
        {
          provide: DeleteUserUseCase,
          useValue: new DeleteUserUseCase(userRepo),
        },
        {
          provide: SearchUsersUseCase,
          useValue: new SearchUsersUseCase(userRepo),
        },
        {
          provide: ChangePasswordUseCase,
          useValue: new ChangePasswordUseCase(
            userRepo,
            passwordHasher,
            passwordPolicy,
            mockPublisher,
          ),
        },
        {
          provide: ResetPasswordUseCase,
          useValue: new ResetPasswordUseCase(
            userRepo,
            passwordHasher,
            tempPasswordGen,
            mockPublisher,
          ),
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    userRepo.clear();
    refreshTokenRepo.clear();
  });

  describe('1. HTTP Pipeline Authentication & Public Endpoint Access', () => {
    it('GET /test-pipeline/public -> 200 OK without authentication', async () => {
      const res = await request(app.getHttpServer()).get('/test-pipeline/public');
      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.status).toBe('public_access_granted');
    });

    it('GET /test-pipeline/protected -> 401 Unauthorized when missing Bearer token', async () => {
      const res = await request(app.getHttpServer()).get('/test-pipeline/protected');
      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('GET /test-pipeline/protected -> 200 OK when authenticated with valid user', async () => {
      const userProps = userFactory.create({ status: 'ACTIVE', roles: ['USER'] });
      const domainUser = new User({ ...userProps, status: UserStatus.ACTIVE });
      await userRepo.create(domainUser);

      const authHeaders = auth(userProps, testSecret).headers();
      const res = await request(app.getHttpServer())
        .get('/test-pipeline/protected')
        .set(authHeaders);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.status).toBe('protected_access_granted');
      expect(res.body.user.userId).toBe(userProps.id);
    });
  });

  describe('2. Account Status & Lifecycle Enforcement via HTTP Pipeline', () => {
    it('GET /test-pipeline/protected -> 401 Unauthorized for PENDING user', async () => {
      const userProps = userFactory.create({ status: 'PENDING' });
      const domainUser = new User({ ...userProps, status: UserStatus.PENDING });
      await userRepo.create(domainUser);

      const authHeaders = auth(userProps, testSecret).headers();
      const res = await request(app.getHttpServer())
        .get('/test-pipeline/protected')
        .set(authHeaders);

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('GET /test-pipeline/protected -> 401 Unauthorized for INACTIVE user', async () => {
      const userProps = userFactory.create({ status: 'INACTIVE' });
      const domainUser = new User({ ...userProps, status: UserStatus.INACTIVE });
      await userRepo.create(domainUser);

      const authHeaders = auth(userProps, testSecret).headers();
      const res = await request(app.getHttpServer())
        .get('/test-pipeline/protected')
        .set(authHeaders);

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });

    it('GET /test-pipeline/protected -> 401 Unauthorized for BLOCKED user', async () => {
      const userProps = userFactory.create({ status: 'BLOCKED' });
      const domainUser = new User({ ...userProps, status: UserStatus.BLOCKED });
      await userRepo.create(domainUser);

      const authHeaders = auth(userProps, testSecret).headers();
      const res = await request(app.getHttpServer())
        .get('/test-pipeline/protected')
        .set(authHeaders);

      expect(res.status).toBe(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('3. Role & Permission Authorization Restrictions (403 Forbidden)', () => {
    it('GET /test-pipeline/owner-only -> 403 Forbidden for TRAINER role', async () => {
      const trainer = createTrainer();
      const domainUser = new User({ ...trainer, status: UserStatus.ACTIVE });
      await userRepo.create(domainUser);

      const authHeaders = auth(trainer, testSecret).headers();
      const res = await request(app.getHttpServer())
        .get('/test-pipeline/owner-only')
        .set(authHeaders);

      expect(res.status).toBe(HttpStatus.FORBIDDEN);
    });

    it('GET /test-pipeline/owner-only -> 200 OK for OWNER role', async () => {
      const owner = createOwner();
      const domainUser = new User({ ...owner, status: UserStatus.ACTIVE });
      await userRepo.create(domainUser);

      const authHeaders = auth(owner, testSecret).headers();
      const res = await request(app.getHttpServer())
        .get('/test-pipeline/owner-only')
        .set(authHeaders);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.status).toBe('owner_access_granted');
    });

    it('GET /test-pipeline/delete-permission -> 403 Forbidden when missing delete:all permission', async () => {
      const trainer = createTrainer();
      const domainUser = new User({ ...trainer, status: UserStatus.ACTIVE });
      await userRepo.create(domainUser);

      const authHeaders = auth(trainer, testSecret).headers();
      const res = await request(app.getHttpServer())
        .get('/test-pipeline/delete-permission')
        .set(authHeaders);

      expect(res.status).toBe(HttpStatus.FORBIDDEN);
    });
  });

  describe('4. User Administration Endpoints via HTTP', () => {
    it('POST /users -> 201 Created user when requested by ADMIN', async () => {
      const adminProps = userFactory.create({ status: 'ACTIVE', roles: ['ADMIN'] });
      const adminUser = new User({ ...adminProps, status: UserStatus.ACTIVE });
      await userRepo.create(adminUser);

      const authHeaders = auth(adminProps, testSecret).headers();
      const res = await request(app.getHttpServer()).post('/users').set(authHeaders).send({
        email: 'e2e.created@kinergy.local',
        password: 'Password123!',
        role: 'TRAINER',
      });

      expect(res.status).toBe(HttpStatus.CREATED);
      expect(res.body.email).toBe('e2e.created@kinergy.local');
    });

    it('GET /users -> 200 OK list users when requested by ADMIN', async () => {
      const adminProps = userFactory.create({ status: 'ACTIVE', roles: ['ADMIN'] });
      const adminUser = new User({ ...adminProps, status: UserStatus.ACTIVE });
      await userRepo.create(adminUser);

      const authHeaders = auth(adminProps, testSecret).headers();
      const res = await request(app.getHttpServer()).get('/users').set(authHeaders);

      expect(res.status).toBe(HttpStatus.OK);
      expect(res.body.total).toBe(1);
    });
  });
});
