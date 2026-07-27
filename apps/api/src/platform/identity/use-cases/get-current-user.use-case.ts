import { IUseCase } from '../../../shared/common/use-case.interface';
import { RequestContext } from '../request-context';
import { IUserRepository } from '../domain/user.repository.interface';
import { GetCurrentUserDto, UserProfileDto } from './dtos/auth.dtos';
import { UserNotFoundException } from './exceptions/auth.exception';

/**
 * Use Case retrieving the currently authenticated user's profile.
 * Ensures strict security boundary: password hashes and internal security tokens are never exposed.
 */
export class GetCurrentUserUseCase implements IUseCase<GetCurrentUserDto, UserProfileDto> {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(request?: GetCurrentUserDto): Promise<UserProfileDto> {
    const activeContext = RequestContext.currentIdentity();
    const userId = request?.userId ?? activeContext?.userId;

    if (!userId) {
      throw new UserNotFoundException('No active user context found.');
    }

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new UserNotFoundException('User profile not found.');
    }

    return {
      id: user.id,
      email: user.email,
      status: user.status,
      roles: user.roles,
      permissions: user.permissions,
      tenantId: user.tenantId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
