import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { LoginUseCase } from '../use-cases/login.use-case';
import { LogoutUseCase } from '../use-cases/logout.use-case';
import { RefreshTokenUseCase } from '../use-cases/refresh-token.use-case';
import { GetCurrentUserUseCase } from '../use-cases/get-current-user.use-case';
import { ChangePasswordUseCase } from '../use-cases/password/change-password.use-case';
import { ResetPasswordUseCase } from '../use-cases/password/reset-password.use-case';
import { AuthenticationGuard } from '../guards/authentication.guard';
import { AuthorizationGuard } from '../authorization/authorization.guard';
import { Public, Roles, Permissions, CurrentUser } from '../decorators';
import { AuthenticatedUserContext } from '../context/authenticated-user-context';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
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
  @ApiOperation({ summary: 'Authenticate user with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful, returns token pair' })
  @ApiResponse({ status: 401, description: 'Invalid email or password' })
  async login(@Body() body: Record<string, unknown>) {
    return this.loginUseCase.execute(body as unknown as Parameters<LoginUseCase['execute']>[0]);
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({ status: 200, description: 'Token pair refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(@Body() body: Record<string, unknown>) {
    return this.refreshTokenUseCase.execute(
      body as unknown as Parameters<RefreshTokenUseCase['execute']>[0],
    );
  }

  @UseGuards(AuthenticationGuard)
  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke active refresh token family and logout' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  async logout(
    @CurrentUser() user: AuthenticatedUserContext,
    @Body() body: Record<string, unknown>,
  ) {
    return this.logoutUseCase.execute({
      refreshToken: body?.refreshToken as string | undefined,
      userId: user.userId,
    });
  }

  @UseGuards(AuthenticationGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get profile details for currently authenticated user' })
  @ApiResponse({ status: 200, description: 'User profile retrieved successfully' })
  async getMe(@CurrentUser() user: AuthenticatedUserContext) {
    return this.getCurrentUserUseCase.execute({ userId: user.userId });
  }

  @UseGuards(AuthenticationGuard)
  @Post('change-password')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password for authenticated user' })
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
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Reset user password (Admin functionality)' })
  async resetPassword(
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUserContext,
  ) {
    return this.resetPasswordUseCase.execute({
      userId,
      adminId: user.userId,
    });
  }
}
