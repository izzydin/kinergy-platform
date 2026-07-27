import { Inject, Injectable } from '@nestjs/common';
import { IUseCase } from '../../../../shared/common';
import { IUserRepository, USER_REPOSITORY } from '../../domain';
import { PaginatedUsersResponseDto, SearchUsersQueryDto } from './dtos/admin-user.dtos';

@Injectable()
export class SearchUsersUseCase implements IUseCase<
  SearchUsersQueryDto,
  PaginatedUsersResponseDto
> {
  constructor(
    @Inject(USER_REPOSITORY)
    private readonly userRepository: IUserRepository,
  ) {}

  async execute(dto: SearchUsersQueryDto): Promise<PaginatedUsersResponseDto> {
    const result = await this.userRepository.search({
      email: dto.email ? dto.email.trim().toLowerCase() : undefined,
      role: dto.role,
      status: dto.status,
      page: dto.page ?? 1,
      limit: dto.limit ?? 10,
    });

    const items = result.items.map((user) => ({
      id: user.id,
      email: user.email,
      status: user.status,
      roles: user.roles,
      permissions: user.permissions,
      tenantId: user.tenantId,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
      deletedAt: user.deletedAt ? user.deletedAt.toISOString() : null,
    }));

    return {
      items,
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }
}
