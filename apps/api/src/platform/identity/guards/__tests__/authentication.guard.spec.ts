import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { User, UserStatus, IUserRepository } from '../../domain';
import { IAccessTokenService } from '../../tokens/access-token.service';
import { AuthenticationGuard } from '../authentication.guard';

describe('AuthenticationGuard', () => {
  let guard: AuthenticationGuard;
  let mockReflector: jest.Mocked<Reflector>;
  let mockAccessTokenService: jest.Mocked<IAccessTokenService>;
  let mockUserRepository: jest.Mocked<IUserRepository>;

  const activeUser = new User({
    id: 'usr_123',
    email: 'active@example.com',
    passwordHash: 'hash',
    status: UserStatus.ACTIVE,
    roles: ['USER'],
    permissions: ['read:profile'],
    tenantId: 'tenant_1',
    tokenVersion: 1,
  });

  const createMockContext = (headers: Record<string, string> = {}): ExecutionContext => {
    const mockRequest = {
      headers,
      user: undefined,
    };

    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    mockReflector = {
      getAllAndOverride: jest.fn().mockReturnValue(false),
    } as unknown as jest.Mocked<Reflector>;

    mockAccessTokenService = {
      generateToken: jest.fn(),
      validateToken: jest.fn(),
    };

    mockUserRepository = {
      findByEmail: jest.fn(),
      findById: jest.fn().mockResolvedValue(activeUser),
      save: jest.fn(),
      updateRefreshToken: jest.fn(),
    };

    guard = new AuthenticationGuard(mockReflector, mockAccessTokenService, mockUserRepository);
  });

  it('should allow access if route is decorated with @Public()', async () => {
    mockReflector.getAllAndOverride.mockReturnValue(true);
    const context = createMockContext();

    const canActivate = await guard.canActivate(context);

    expect(canActivate).toBe(true);
    expect(mockAccessTokenService.validateToken).not.toHaveBeenCalled();
  });

  it('should throw UnauthorizedException if Authorization header is missing', async () => {
    const context = createMockContext({});

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if Authorization scheme is not Bearer', async () => {
    const context = createMockContext({ authorization: 'Basic dXNlcjpwYXNz' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if access token validation fails', async () => {
    mockAccessTokenService.validateToken.mockResolvedValue(null);
    const context = createMockContext({ authorization: 'Bearer invalid_token' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if user is not found in database', async () => {
    mockAccessTokenService.validateToken.mockResolvedValue({
      sub: 'usr_nonexistent',
      email: 'none@example.com',
      roles: ['USER'],
      permissions: [],
      tokenVersion: 1,
      tenantId: null,
    });
    mockUserRepository.findById.mockResolvedValue(null);

    const context = createMockContext({ authorization: 'Bearer valid_token' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if user account status is SUSPENDED or not ACTIVE', async () => {
    const suspendedUser = new User({
      id: 'usr_suspended',
      email: 'suspended@example.com',
      passwordHash: 'hash',
      status: UserStatus.SUSPENDED,
      roles: ['USER'],
      permissions: [],
    });

    mockAccessTokenService.validateToken.mockResolvedValue({
      sub: 'usr_suspended',
      email: 'suspended@example.com',
      roles: ['USER'],
      permissions: [],
      tokenVersion: 1,
      tenantId: null,
    });
    mockUserRepository.findById.mockResolvedValue(suspendedUser);

    const context = createMockContext({ authorization: 'Bearer valid_token' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if tokenVersion in payload does not match current user tokenVersion', async () => {
    mockAccessTokenService.validateToken.mockResolvedValue({
      sub: 'usr_123',
      email: 'active@example.com',
      roles: ['USER'],
      permissions: [],
      tokenVersion: 1, // Old token version
      tenantId: null,
    });

    const incrementedUser = new User({
      id: 'usr_123',
      email: 'active@example.com',
      passwordHash: 'hash',
      status: UserStatus.ACTIVE,
      roles: ['USER'],
      permissions: [],
      tokenVersion: 2, // User token version has been incremented (sessions revoked)
    });
    mockUserRepository.findById.mockResolvedValue(incrementedUser);

    const context = createMockContext({ authorization: 'Bearer valid_token' });

    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('should populate request.user and return true for valid active user token', async () => {
    mockAccessTokenService.validateToken.mockResolvedValue({
      sub: 'usr_123',
      email: 'active@example.com',
      roles: ['USER'],
      permissions: ['read:profile'],
      tokenVersion: 1,
      tenantId: 'tenant_1',
    });

    const context = createMockContext({ authorization: 'Bearer valid_token' });
    const canActivate = await guard.canActivate(context);

    expect(canActivate).toBe(true);

    const req = context.switchToHttp().getRequest<{ user: Record<string, unknown> }>();
    expect(req.user).toBeDefined();
    expect(req.user.id).toBe('usr_123');
    expect(req.user.status).toBe(UserStatus.ACTIVE);
  });
});
