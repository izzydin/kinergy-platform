import { AuthApplicationService } from '../auth-application.service';
import { LoginUseCase } from '../../use-cases/login.use-case';
import { LogoutUseCase } from '../../use-cases/logout.use-case';
import { RefreshTokenUseCase } from '../../use-cases/refresh-token.use-case';
import { GetCurrentUserUseCase } from '../../use-cases/get-current-user.use-case';
import { UserStatus } from '../../domain';

describe('AuthApplicationService', () => {
  let service: AuthApplicationService;
  let mockLoginUseCase: jest.Mocked<LoginUseCase>;
  let mockLogoutUseCase: jest.Mocked<LogoutUseCase>;
  let mockRefreshTokenUseCase: jest.Mocked<RefreshTokenUseCase>;
  let mockGetCurrentUserUseCase: jest.Mocked<GetCurrentUserUseCase>;

  const mockAuthResponse = {
    accessToken: 'access_token',
    refreshToken: 'refresh_token',
    tokenType: 'Bearer' as const,
    expiresIn: 900,
    user: {
      id: 'usr_1',
      email: 'test@example.com',
      status: UserStatus.ACTIVE,
      roles: ['USER'],
      permissions: [],
      tenantId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  beforeEach(() => {
    mockLoginUseCase = {
      execute: jest.fn().mockResolvedValue(mockAuthResponse),
    } as unknown as jest.Mocked<LoginUseCase>;

    mockLogoutUseCase = {
      execute: jest.fn().mockResolvedValue({ success: true }),
    } as unknown as jest.Mocked<LogoutUseCase>;

    mockRefreshTokenUseCase = {
      execute: jest.fn().mockResolvedValue(mockAuthResponse),
    } as unknown as jest.Mocked<RefreshTokenUseCase>;

    mockGetCurrentUserUseCase = {
      execute: jest.fn().mockResolvedValue(mockAuthResponse.user),
    } as unknown as jest.Mocked<GetCurrentUserUseCase>;

    service = new AuthApplicationService(
      mockLoginUseCase,
      mockLogoutUseCase,
      mockRefreshTokenUseCase,
      mockGetCurrentUserUseCase,
    );
  });

  it('should delegate login to LoginUseCase', async () => {
    const dto = { email: 'test@example.com', password: 'Password123!' };
    const res = await service.login(dto);

    expect(mockLoginUseCase.execute).toHaveBeenCalledWith(dto);
    expect(res).toEqual(mockAuthResponse);
  });

  it('should delegate logout to LogoutUseCase', async () => {
    const dto = { userId: 'usr_1' };
    const res = await service.logout(dto);

    expect(mockLogoutUseCase.execute).toHaveBeenCalledWith(dto);
    expect(res).toEqual({ success: true });
  });

  const mockRefreshTokenDto = { refreshToken: 'token' };
  it('should delegate refreshToken to RefreshTokenUseCase', async () => {
    const res = await service.refreshToken(mockRefreshTokenDto);

    expect(mockRefreshTokenUseCase.execute).toHaveBeenCalledWith(mockRefreshTokenDto);
    expect(res).toEqual(mockAuthResponse);
  });

  it('should delegate getCurrentUser to GetCurrentUserUseCase', async () => {
    const dto = { userId: 'usr_1' };
    const res = await service.getCurrentUser(dto);

    expect(mockGetCurrentUserUseCase.execute).toHaveBeenCalledWith(dto);
    expect(res).toEqual(mockAuthResponse.user);
  });
});
