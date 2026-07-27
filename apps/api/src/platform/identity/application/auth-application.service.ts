import { LoginUseCase } from '../use-cases/login.use-case';
import { LogoutUseCase, LogoutResponse } from '../use-cases/logout.use-case';
import { RefreshTokenUseCase } from '../use-cases/refresh-token.use-case';
import { GetCurrentUserUseCase } from '../use-cases/get-current-user.use-case';
import {
  AuthenticationResponse,
  GetCurrentUserDto,
  LoginDto,
  LogoutDto,
  RefreshTokenDto,
  UserProfileDto,
} from '../use-cases/dtos/auth.dtos';

/**
 * Application Service Facade for Authentication Use Cases.
 * Coordinates execution of authentication operations.
 */
export class AuthApplicationService {
  constructor(
    private readonly loginUseCase: LoginUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
  ) {}

  async login(dto: LoginDto): Promise<AuthenticationResponse> {
    return this.loginUseCase.execute(dto);
  }

  async logout(dto?: LogoutDto): Promise<LogoutResponse> {
    return this.logoutUseCase.execute(dto);
  }

  async refreshToken(dto: RefreshTokenDto): Promise<AuthenticationResponse> {
    return this.refreshTokenUseCase.execute(dto);
  }

  async getCurrentUser(dto?: GetCurrentUserDto): Promise<UserProfileDto> {
    return this.getCurrentUserUseCase.execute(dto);
  }
}
