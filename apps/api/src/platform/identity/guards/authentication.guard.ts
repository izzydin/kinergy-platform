import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ACCESS_TOKEN_SERVICE, IAccessTokenService } from '../tokens/access-token.service';
import { IUserRepository, USER_REPOSITORY, UserStatus } from '../domain';
import { AuthenticatedUserContext } from '../context/authenticated-user-context';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * Primary Authentication Guard for HTTP API Requests.
 * Validates JWT access tokens, signature, expiration, required claims, user existence, and account status.
 * Constructs and populates the unified AuthenticatedUserContext model.
 */
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(ACCESS_TOKEN_SERVICE)
    private readonly accessTokenService: IAccessTokenService,
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Authentication token required.');
    }

    const payload = await this.accessTokenService.validateToken(token);
    if (!payload || !payload.sub) {
      throw new UnauthorizedException('Invalid or expired authentication token.');
    }

    const user = await this.userRepository.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Authenticated user not found.');
    }

    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('User account is inactive or disabled.');
    }

    if (payload.tokenVersion !== undefined && payload.tokenVersion !== user.tokenVersion) {
      throw new UnauthorizedException('Session token has been invalidated.');
    }

    const userContext = new AuthenticatedUserContext({
      userId: user.id,
      email: user.email,
      status: user.status,
      roles: user.roles,
      permissions: user.permissions,
      tenantId: user.tenantId,
    });

    (request as unknown as { user: unknown }).user = userContext;

    return true;
  }

  private extractTokenFromHeader(request: Request): string | null {
    const authHeader = request.headers?.authorization;
    if (!authHeader) {
      return null;
    }
    const [type, token] = authHeader.split(' ');
    return type === 'Bearer' && token ? token : null;
  }
}
