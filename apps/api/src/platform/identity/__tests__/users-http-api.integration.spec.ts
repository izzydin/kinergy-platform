import { ExecutionContext, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { UsersController } from '../controllers/users.controller';
import {
  CreateUserUseCase,
  SearchUsersUseCase,
  UpdateUserUseCase,
  ActivateUserUseCase,
  DeactivateUserUseCase,
  DeleteUserUseCase,
  GetCurrentUserUseCase,
} from '../use-cases';
import {
  IUserRepository,
  USER_REPOSITORY,
  User,
  UserStatus,
  UserSearchQuery,
  UserSearchResult,
} from '../domain';
import { PASSWORD_HASHER, Argon2PasswordHasher } from '../password';
import { AuthenticationGuard } from '../guards/authentication.guard';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { AuthenticatedUserContext } from '../context/authenticated-user-context';
import {
  AUTHORIZATION_EVALUATOR,
  PERMISSION_RESOLVER,
  DefaultAuthorizationEvaluator,
  DefaultPermissionResolver,
} from '../authorization';
import { ACCESS_TOKEN_SERVICE } from '../tokens';
import { GlobalExceptionFilter } from '../../../common/filters';
import { GlobalSanitizationValidationPipe } from '../../../common/pipes';

class InMemoryTestUserRepository implements IUserRepository {
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

describe('UsersController HTTP Integration & Security Contract', () => {
  let app: INestApplication;
  let userRepo: InMemoryTestUserRepository;
  let currentUserContext: Record<string, unknown> | null = null;

  beforeAll(async () => {
    userRepo = new InMemoryTestUserRepository();
    const passwordHasher = new Argon2PasswordHasher();

    const createUserUseCase = new CreateUserUseCase(userRepo, passwordHasher);
    const searchUsersUseCase = new SearchUsersUseCase(userRepo);
    const updateUserUseCase = new UpdateUserUseCase(userRepo);
    const activateUserUseCase = new ActivateUserUseCase(userRepo);
    const deactivateUserUseCase = new DeactivateUserUseCase(userRepo);
    const deleteUserUseCase = new DeleteUserUseCase(userRepo);
    const getCurrentUserUseCase = new GetCurrentUserUseCase(userRepo);

    const moduleRef: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        { provide: USER_REPOSITORY, useValue: userRepo },
        { provide: PASSWORD_HASHER, useValue: passwordHasher },
        { provide: CreateUserUseCase, useValue: createUserUseCase },
        { provide: SearchUsersUseCase, useValue: searchUsersUseCase },
        { provide: UpdateUserUseCase, useValue: updateUserUseCase },
        { provide: ActivateUserUseCase, useValue: activateUserUseCase },
        { provide: DeactivateUserUseCase, useValue: deactivateUserUseCase },
        { provide: DeleteUserUseCase, useValue: deleteUserUseCase },
        { provide: GetCurrentUserUseCase, useValue: getCurrentUserUseCase },
        {
          provide: ACCESS_TOKEN_SERVICE,
          useValue: { validateToken: jest.fn() },
        },
        {
          provide: PERMISSION_RESOLVER,
          useClass: DefaultPermissionResolver,
        },
        {
          provide: AUTHORIZATION_EVALUATOR,
          useClass: DefaultAuthorizationEvaluator,
        },
        AuthorizationGuard,
      ],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          if (!currentUserContext) {
            throw new UnauthorizedException('Authentication token required.');
          }
          if (currentUserContext.status !== 'ACTIVE') {
            throw new UnauthorizedException('User account is inactive or disabled.');
          }
          const req = context.switchToHttp().getRequest();
          req.user = new AuthenticatedUserContext({
            userId: currentUserContext.userId as string,
            email: currentUserContext.email as string,
            status: currentUserContext.status as UserStatus,
            roles: (currentUserContext.roles as string[]) ?? [],
            permissions: (currentUserContext.permissions as string[]) ?? [],
            tenantId: (currentUserContext.tenantId as string) ?? null,
          });
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();

    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(new GlobalSanitizationValidationPipe());

    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  beforeEach(() => {
    userRepo.clear();
    currentUserContext = null;
  });

  const asAdmin = () => {
    currentUserContext = {
      userId: 'usr_admin',
      email: 'admin@kinergy.test',
      status: 'ACTIVE',
      roles: ['ADMIN'],
      permissions: ['users.read', 'users.write', 'users.delete'],
      tenantId: 'tenant_1',
    };
  };

  const asReader = () => {
    currentUserContext = {
      userId: 'usr_reader',
      email: 'reader@kinergy.test',
      status: 'ACTIVE',
      roles: ['VIEWER'],
      permissions: ['users.read'],
      tenantId: 'tenant_1',
    };
  };

  const asDisabled = () => {
    currentUserContext = {
      userId: 'usr_disabled',
      email: 'disabled@kinergy.test',
      status: 'DISABLED',
      roles: ['ADMIN'],
      permissions: ['users.read', 'users.write', 'users.delete'],
      tenantId: 'tenant_1',
    };
  };

  describe('Route Security & Authorization Boundaries', () => {
    it('returns 401 Unauthorized when unauthenticated', async () => {
      currentUserContext = null;

      const res = await request(app.getHttpServer()).get('/api/v1/admin/users');
      expect(res.status).toBe(401);
    });

    it('returns 401 Unauthorized when user is disabled/inactive', async () => {
      asDisabled();

      const res = await request(app.getHttpServer()).get('/api/v1/admin/users');
      expect(res.status).toBe(401);
    });

    it('returns 403 Forbidden when user lacks users.write permission on POST', async () => {
      asReader();

      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/users')
        .send({ email: 'newuser@kinergy.test' });

      expect(res.status).toBe(403);
    });

    it('returns 403 Forbidden when user lacks users.delete permission on deactivate', async () => {
      asReader();

      const res = await request(app.getHttpServer()).post('/api/v1/admin/users/usr_any/deactivate');

      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/v1/admin/users & /api/v1/users (Create User)', () => {
    it('returns 400 Bad Request on invalid email format', async () => {
      asAdmin();

      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/users')
        .send({ email: 'invalid-email-address' });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/Invalid email address format/i);
    });

    it('returns 400 Bad Request on missing email', async () => {
      asAdmin();

      const res = await request(app.getHttpServer()).post('/api/v1/admin/users').send({});

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toMatch(/Email address is required/i);
    });

    it('creates a user and returns 201 Created with enriched user shape', async () => {
      asAdmin();

      const res = await request(app.getHttpServer()).post('/api/v1/admin/users').send({
        email: 'Jane.Doe@Kinergy.Test',
        name: 'Jane Doe',
        role: 'ADMIN',
        tenantId: 'tenant_1',
      });

      expect(res.status).toBe(201);
      expect(res.body.id).toMatch(/^usr_/);
      expect(res.body.email).toBe('jane.doe@kinergy.test');
      expect(res.body.name).toBe('Jane Doe');
      expect(res.body.status).toBe('ACTIVE');
      expect(res.body.roles).toContain('ADMIN');
      expect(res.body.tenantId).toBe('tenant_1');
    });

    it('also resolves under /api/v1/users path', async () => {
      asAdmin();

      const res = await request(app.getHttpServer()).post('/api/v1/users').send({
        email: 'secondary@kinergy.test',
        name: 'Secondary User',
      });

      expect(res.status).toBe(201);
      expect(res.body.email).toBe('secondary@kinergy.test');
    });

    it('returns 409 Conflict when user email already exists', async () => {
      asAdmin();

      // First creation
      await request(app.getHttpServer())
        .post('/api/v1/admin/users')
        .send({ email: 'duplicate@kinergy.test' });

      // Second creation with same email
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/users')
        .send({ email: 'duplicate@kinergy.test' });

      expect(res.status).toBe(409);
      expect(JSON.stringify(res.body)).toMatch(/already exists/i);
    });
  });

  describe('GET /api/v1/admin/users (Search & Paginate)', () => {
    beforeEach(async () => {
      const hasher = new Argon2PasswordHasher();
      const hash = await hasher.hash('Password123!');
      await userRepo.create(
        new User({
          id: 'usr_admin_1',
          email: 'admin1@kinergy.test',
          passwordHash: hash,
          status: UserStatus.ACTIVE,
          roles: ['ADMIN'],
          permissions: [],
        }),
      );
      await userRepo.create(
        new User({
          id: 'usr_member_1',
          email: 'member1@kinergy.test',
          passwordHash: hash,
          status: UserStatus.PENDING,
          roles: ['MEMBER'],
          permissions: [],
        }),
      );
      await userRepo.create(
        new User({
          id: 'usr_operator_1',
          email: 'operator1@kinergy.test',
          passwordHash: hash,
          status: UserStatus.ACTIVE,
          roles: ['OPERATOR'],
          permissions: [],
        }),
      );
    });

    it('returns 200 OK and paginated list of all users', async () => {
      asReader();

      const res = await request(app.getHttpServer()).get('/api/v1/admin/users?page=1&limit=10');

      expect(res.status).toBe(200);
      expect(res.body.items).toBeDefined();
      expect(res.body.items.length).toBe(3);
      expect(res.body.total).toBe(3);
      expect(res.body.totalPages).toBe(1);
    });

    it('filters by query term q (matching email)', async () => {
      asReader();

      const res = await request(app.getHttpServer()).get('/api/v1/admin/users?q=member');

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].email).toBe('member1@kinergy.test');
    });

    it('filters by role', async () => {
      asReader();

      const res = await request(app.getHttpServer()).get('/api/v1/admin/users?role=OPERATOR');

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].email).toBe('operator1@kinergy.test');
    });

    it('filters by status', async () => {
      asReader();

      const res = await request(app.getHttpServer()).get('/api/v1/admin/users?status=PENDING');

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].status).toBe('PENDING');
    });
  });

  describe('GET /api/v1/admin/users/:userId (Get User by ID)', () => {
    it('returns 404 Not Found when user does not exist', async () => {
      asReader();

      const res = await request(app.getHttpServer()).get('/api/v1/admin/users/usr_nonexistent');

      expect(res.status).toBe(404);
    });

    it('returns 200 OK with user profile details', async () => {
      asAdmin();
      const created = await request(app.getHttpServer())
        .post('/api/v1/admin/users')
        .send({ email: 'target@kinergy.test', name: 'Target User' });
      const userId = created.body.id;

      asReader();
      const res = await request(app.getHttpServer()).get(`/api/v1/admin/users/${userId}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(userId);
      expect(res.body.email).toBe('target@kinergy.test');
    });
  });

  describe('PUT & PATCH /api/v1/admin/users/:userId (Update User)', () => {
    it('updates user email and role using PUT and PATCH aliases', async () => {
      asAdmin();
      const created = await request(app.getHttpServer())
        .post('/api/v1/admin/users')
        .send({ email: 'original@kinergy.test' });
      const userId = created.body.id;

      // PUT update
      const putRes = await request(app.getHttpServer())
        .put(`/api/v1/admin/users/${userId}`)
        .send({ email: 'modified@kinergy.test', name: 'Modified User' });

      expect(putRes.status).toBe(200);
      expect(putRes.body.email).toBe('modified@kinergy.test');
      expect(putRes.body.name).toBe('Modified User');

      // PATCH alias
      const patchRes = await request(app.getHttpServer())
        .patch(`/api/v1/admin/users/${userId}`)
        .send({ role: 'OPERATOR' });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.roles).toContain('OPERATOR');
    });

    it('returns 404 Not Found when updating a non-existent user', async () => {
      asAdmin();

      const res = await request(app.getHttpServer())
        .put('/api/v1/admin/users/usr_not_found')
        .send({ email: 'test@kinergy.test' });

      expect(res.status).toBe(404);
    });
  });

  describe('POST & PATCH /api/v1/admin/users/:userId/activate', () => {
    it('activates user account using POST and PATCH aliases', async () => {
      const hasher = new Argon2PasswordHasher();
      const hash = await hasher.hash('Password123!');
      await userRepo.create(
        new User({
          id: 'usr_inactive_1',
          email: 'inactive@kinergy.test',
          passwordHash: hash,
          status: UserStatus.PENDING,
          roles: ['USER'],
          permissions: [],
        }),
      );

      asAdmin();
      const res = await request(app.getHttpServer()).post(
        '/api/v1/admin/users/usr_inactive_1/activate',
      );

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ACTIVE');

      // Also test PATCH alias idempotency
      const patchRes = await request(app.getHttpServer()).patch(
        '/api/v1/admin/users/usr_inactive_1/activate',
      );
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.status).toBe('ACTIVE');
    });

    it('returns 404 Not Found when activating non-existent user', async () => {
      asAdmin();

      const res = await request(app.getHttpServer()).post(
        '/api/v1/admin/users/usr_missing/activate',
      );

      expect(res.status).toBe(404);
    });
  });

  describe('POST & PATCH /api/v1/admin/users/:userId/deactivate', () => {
    it('deactivates active user account using POST and PATCH aliases', async () => {
      const hasher = new Argon2PasswordHasher();
      const hash = await hasher.hash('Password123!');
      await userRepo.create(
        new User({
          id: 'usr_active_to_deactivate',
          email: 'deact@kinergy.test',
          passwordHash: hash,
          status: UserStatus.ACTIVE,
          roles: ['USER'],
          permissions: [],
        }),
      );

      asAdmin();
      const res = await request(app.getHttpServer()).post(
        '/api/v1/admin/users/usr_active_to_deactivate/deactivate',
      );

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('DEACTIVATED');

      // Verify PATCH alias
      const patchRes = await request(app.getHttpServer()).patch(
        '/api/v1/admin/users/usr_active_to_deactivate/deactivate',
      );
      expect(patchRes.status).toBe(200);
    });

    it('returns 422 Unprocessable Entity when lifecycle transition is forbidden (e.g. BLOCKED -> DEACTIVATED)', async () => {
      const hasher = new Argon2PasswordHasher();
      const hash = await hasher.hash('Password123!');
      await userRepo.create(
        new User({
          id: 'usr_blocked_1',
          email: 'blocked@kinergy.test',
          passwordHash: hash,
          status: UserStatus.BLOCKED,
          roles: ['USER'],
          permissions: [],
        }),
      );

      asAdmin();
      const res = await request(app.getHttpServer()).post(
        '/api/v1/admin/users/usr_blocked_1/deactivate',
      );

      expect(res.status).toBe(422);
      expect(JSON.stringify(res.body)).toMatch(/Invalid user status transition/i);
    });

    it('returns 404 Not Found when deactivating non-existent user', async () => {
      asAdmin();

      const res = await request(app.getHttpServer()).post(
        '/api/v1/admin/users/usr_missing/deactivate',
      );

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/v1/admin/users/:userId', () => {
    it('soft deletes user account', async () => {
      const hasher = new Argon2PasswordHasher();
      const hash = await hasher.hash('Password123!');
      await userRepo.create(
        new User({
          id: 'usr_to_delete',
          email: 'delete@kinergy.test',
          passwordHash: hash,
          status: UserStatus.ACTIVE,
          roles: ['USER'],
          permissions: [],
        }),
      );

      asAdmin();
      const res = await request(app.getHttpServer()).delete('/api/v1/admin/users/usr_to_delete');

      expect(res.status).toBe(200);
    });
  });
});
