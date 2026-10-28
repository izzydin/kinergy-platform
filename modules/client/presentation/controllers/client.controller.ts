import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Optional,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { RegisterClientUseCase } from '../../application/use-cases/register-client.usecase';
import { LinkIdentityToClientUseCase } from '../../application/use-cases/link-identity-to-client.usecase';
import { GetClientProfileUseCase } from '../../application/use-cases/get-client-profile.usecase';
import { SearchClientsUseCase } from '../../application/use-cases/search-clients.usecase';
import { UpdateClientUseCase } from '../../application/use-cases/update-client.usecase';
import { ArchiveClientUseCase } from '../../application/use-cases/archive-client.usecase';
import { RestoreClientUseCase } from '../../application/use-cases/restore-client.usecase';
import { GetClientHistoryUseCase } from '../../application/use-cases/get-client-history.usecase';
import { RegisterClientCommand } from '../../application/commands/register-client.command';
import { LinkIdentityCommand } from '../../application/commands/link-identity.command';
import { UpdateClientCommand } from '../../application/commands/update-client.command';
import { ArchiveClientCommand } from '../../application/commands/archive-client.command';
import { RestoreClientCommand } from '../../application/commands/restore-client.command';
import { GetClientProfileQuery } from '../../application/queries/get-client-profile.query';
import { SearchClientsQuery } from '../../application/queries/search-clients.query';
import { GetClientHistoryQuery } from '../../application/queries/get-client-history.query';
import { ClientProfileDto } from '../../application/dto/client-profile.dto';
import { ClientTimelineEntryDto } from '../../application/dto/client-timeline-entry.dto';
import { PaginatedResultDto } from '../../application/dto/paginated-result.dto';
import {
  ClientResponseDto,
  LinkIdentityRequestDto,
  PotentialMatchesResponseDto,
  RegisterClientRequestDto,
  SearchClientsQueryDto,
  UpdateClientRequestDto,
  GetClientHistoryQueryDto,
} from '../dto';
import { ClientExceptionFilter } from '../filters/client-exception.filter';

interface ClientAuthTokenValidator {
  validateToken(token: string): Promise<{
    sub?: string;
    email?: string;
    roles?: string[];
    permissions?: string[];
    status?: string;
    tokenVersion?: number;
  } | null>;
}

interface ClientAuthUserRepository {
  findById(id: string): Promise<{
    id: string;
    email: string;
    status: string;
    roles: string[];
    permissions: string[];
    tokenVersion?: number;
  } | null>;
}

interface ClientPermissionResolver {
  resolvePermissions(
    userId: string,
    roles: string[],
    permissions: string[],
    tenantId?: string | null,
  ): Promise<string[]>;
}

interface ResolvedClientPrincipal {
  userId: string;
  roles: string[];
  permissions: string[];
}

@ApiTags('Clients')
@Controller('clients')
@UseFilters(ClientExceptionFilter)
export class ClientController {
  constructor(
    private readonly registerClientUseCase: RegisterClientUseCase,
    private readonly linkIdentityUseCase: LinkIdentityToClientUseCase,
    private readonly getClientProfileUseCase: GetClientProfileUseCase,
    private readonly searchClientsUseCase: SearchClientsUseCase,
    private readonly updateClientUseCase: UpdateClientUseCase,
    private readonly archiveClientUseCase: ArchiveClientUseCase,
    private readonly restoreClientUseCase: RestoreClientUseCase,
    private readonly getClientHistoryUseCase: GetClientHistoryUseCase,
    @Optional()
    @Inject('ACCESS_TOKEN_SERVICE')
    private readonly accessTokenService?: ClientAuthTokenValidator,
    @Optional()
    @Inject('USER_REPOSITORY')
    private readonly userRepository?: ClientAuthUserRepository,
    @Optional()
    @Inject('PERMISSION_RESOLVER')
    private readonly permissionResolver?: ClientPermissionResolver,
  ) {}

  private async authenticateAndAuthorize(
    req: Request | undefined,
    requiredAction: 'read' | 'write' | 'archive',
  ): Promise<ResolvedClientPrincipal | undefined> {
    if (!req) {
      return undefined;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let userPayload = (req as any).user as
      | {
          userId?: string;
          id?: string;
          roles?: string[];
          permissions?: string[];
          status?: string;
        }
      | undefined;

    if (!userPayload) {
      const authHeader = req.headers?.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException('Authentication token required.');
      }
      const token = authHeader.slice('Bearer '.length).trim();
      if (!token) {
        throw new UnauthorizedException('Authentication token required.');
      }

      if (this.accessTokenService) {
        const tokenPayload = await this.accessTokenService.validateToken(token);
        if (!tokenPayload || !tokenPayload.sub) {
          throw new UnauthorizedException('Invalid or expired authentication token.');
        }

        if (this.userRepository) {
          const user = await this.userRepository.findById(tokenPayload.sub);
          if (!user) {
            throw new UnauthorizedException('Authenticated user not found.');
          }
          if (user.status && user.status !== 'ACTIVE') {
            throw new UnauthorizedException('User account is inactive or disabled.');
          }
          if (
            tokenPayload.tokenVersion !== undefined &&
            user.tokenVersion !== undefined &&
            tokenPayload.tokenVersion !== user.tokenVersion
          ) {
            throw new UnauthorizedException('Session token has been invalidated.');
          }
          userPayload = {
            userId: user.id,
            roles: user.roles,
            permissions: Array.from(
              new Set([...(user.permissions ?? []), ...(tokenPayload.permissions ?? [])]),
            ),
            status: user.status,
          };
        } else {
          userPayload = {
            userId: tokenPayload.sub,
            roles: tokenPayload.roles ?? [],
            permissions: tokenPayload.permissions ?? [],
            status: tokenPayload.status ?? 'ACTIVE',
          };
        }
      } else {
        const parts = token.split('.');
        if (parts.length !== 3 || !parts[1]) {
          throw new UnauthorizedException('Invalid or expired authentication token.');
        }
        try {
          const decoded = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
            sub?: string;
            roles?: string[];
            permissions?: string[];
            status?: string;
            exp?: number;
          };
          if (!decoded || !decoded.sub) {
            throw new UnauthorizedException('Invalid or expired authentication token.');
          }
          if (typeof decoded.exp === 'number' && decoded.exp * 1000 < Date.now()) {
            throw new UnauthorizedException('Invalid or expired authentication token.');
          }
          if (decoded.status && decoded.status !== 'ACTIVE') {
            throw new UnauthorizedException('User account is inactive or disabled.');
          }
          userPayload = {
            userId: decoded.sub,
            roles: Array.isArray(decoded.roles) ? decoded.roles : [],
            permissions: Array.isArray(decoded.permissions) ? decoded.permissions : [],
            status: decoded.status ?? 'ACTIVE',
          };
        } catch (err) {
          if (err instanceof UnauthorizedException) {
            throw err;
          }
          throw new UnauthorizedException('Invalid or expired authentication token.');
        }
      }
    }

    if (!userPayload) {
      return undefined;
    }

    const userId = userPayload.userId ?? userPayload.id ?? '';
    const roles = [...(userPayload.roles ?? [])];
    let permissions = [...(userPayload.permissions ?? [])];

    if (this.permissionResolver && userId) {
      permissions = await this.permissionResolver.resolvePermissions(userId, roles, permissions);
    }

    const normPerms = permissions.map((p) => p.replace(/:/g, '.').toLowerCase());
    const normRoles = roles.map((r) => r.toUpperCase());
    const hasWildcard =
      normPerms.includes('*') || normPerms.includes('*.*.*') || normPerms.includes('clients.*');

    if (requiredAction === 'archive') {
      const isAuthorizedArchive =
        hasWildcard ||
        normRoles.includes('ADMIN') ||
        normRoles.includes('STAFF') ||
        normRoles.includes('OWNER') ||
        normPerms.includes('clients.delete') ||
        normPerms.includes('client.delete') ||
        normPerms.includes('manage.clients');
      if (!isAuthorizedArchive) {
        throw new ForbiddenException(
          'Only administrative staff can archive or restore client profiles.',
        );
      }
    } else if (requiredAction === 'write') {
      const hasExplicitPermissionsOrRoles = normPerms.length > 0 || normRoles.length > 0;
      const isAuthorizedWrite =
        !hasExplicitPermissionsOrRoles ||
        hasWildcard ||
        normPerms.includes('clients.write') ||
        normPerms.includes('client.write') ||
        normPerms.includes('manage.clients') ||
        normRoles.includes('ADMIN') ||
        normRoles.includes('OWNER') ||
        normRoles.includes('RECEPTIONIST') ||
        normRoles.includes('STAFF');
      if (!isAuthorizedWrite) {
        throw new ForbiddenException("Access denied: missing required permission 'clients.write'.");
      }
    } else if (requiredAction === 'read') {
      const hasExplicitPermissionsOrRoles = normPerms.length > 0 || normRoles.length > 0;
      const isAuthorizedRead =
        !hasExplicitPermissionsOrRoles ||
        hasWildcard ||
        normPerms.includes('clients.read') ||
        normPerms.includes('client.read') ||
        normPerms.includes('read.clients') ||
        normPerms.includes('clients.write') ||
        normPerms.includes('manage.clients') ||
        normRoles.includes('ADMIN') ||
        normRoles.includes('OWNER') ||
        normRoles.includes('RECEPTIONIST') ||
        normRoles.includes('TRAINER') ||
        normRoles.includes('STAFF');
      if (!isAuthorizedRead) {
        throw new ForbiddenException("Access denied: missing required permission 'clients.read'.");
      }
    }

    return {
      userId,
      roles,
      permissions,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Search and filter clients' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of clients matching criteria retrieved successfully',
    type: PaginatedResultDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid search query parameters' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async search(
    @Query() queryDto: SearchClientsQueryDto,
    @Req() req: Request,
  ): Promise<PaginatedResultDto<ClientProfileDto>> {
    const requestingContext = await this.authenticateAndAuthorize(req, 'read');

    const query = new SearchClientsQuery({
      query: queryDto.query,
      status: queryDto.status,
      includeArchived: queryDto.includeArchived,
      createdFrom: queryDto.createdFrom,
      createdTo: queryDto.createdTo,
      sortBy: queryDto.sortBy,
      sortOrder: queryDto.sortOrder,
      page: queryDto.page,
      limit: queryDto.limit,
      requestingContext,
    });

    return this.searchClientsUseCase.execute(query);
  }

  @Get('search')
  @ApiOperation({ summary: 'Quick client lookup by search term (Gym/Reception)' })
  @ApiResponse({
    status: 200,
    description: 'Matching client profiles retrieved successfully',
    type: [ClientProfileDto],
  })
  async quickSearch(
    @Query('q') q?: string,
    @Query('search') search?: string,
    @Req() req?: Request,
  ): Promise<ClientProfileDto[]> {
    const requestingContext = await this.authenticateAndAuthorize(req, 'read');
    const term = (q ?? search ?? '').trim();
    if (!term) {
      return [];
    }

    const query = new SearchClientsQuery({
      query: term,
      includeArchived: false,
      page: 1,
      limit: 20,
      requestingContext,
    });

    const result = await this.searchClientsUseCase.execute(query);
    return result.items;
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Get client activity timeline history' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({
    status: 200,
    description: 'Paginated client timeline entries retrieved successfully',
    type: PaginatedResultDto,
  })
  @ApiResponse({ status: 404, description: 'Client not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getHistory(
    @Param('id') id: string,
    @Query() queryDto: GetClientHistoryQueryDto,
    @Req() req: Request,
  ): Promise<PaginatedResultDto<ClientTimelineEntryDto>> {
    await this.authenticateAndAuthorize(req, 'read');

    const query = new GetClientHistoryQuery({
      clientId: id,
      page: queryDto.page ?? 1,
      limit: queryDto.limit ?? 20,
    });

    return this.getClientHistoryUseCase.execute(query);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Get client activity timeline' })
  @ApiQuery({ name: 'page', required: false, type: Number, example: 1 })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  @ApiResponse({
    status: 200,
    description: 'Paginated client timeline entries retrieved successfully',
    type: PaginatedResultDto,
  })
  @ApiResponse({ status: 404, description: 'Client not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getTimeline(
    @Param('id') id: string,
    @Query() queryDto: GetClientHistoryQueryDto,
    @Req() req: Request,
  ): Promise<PaginatedResultDto<ClientTimelineEntryDto>> {
    return this.getHistory(id, queryDto, req);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get client profile' })
  @ApiResponse({
    status: 200,
    description: 'Client profile retrieved successfully',
    type: ClientProfileDto,
  })
  @ApiResponse({ status: 404, description: 'Client profile not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@Param('id') id: string, @Req() req: Request): Promise<ClientProfileDto> {
    const requestingContext = await this.authenticateAndAuthorize(req, 'read');

    const query = new GetClientProfileQuery({
      clientId: id,
      requestingContext,
    });

    return this.getClientProfileUseCase.execute(query);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update client profile details' })
  @ApiResponse({
    status: 200,
    description: 'Client profile updated successfully',
    type: ClientProfileDto,
  })
  @ApiResponse({ status: 409, description: 'Conflict (e.g. duplicate email or phone)' })
  @ApiResponse({ status: 412, description: 'Precondition Failed (optimistic version mismatch)' })
  @ApiResponse({ status: 422, description: 'Unprocessable Entity (archived client)' })
  @ApiResponse({ status: 404, description: 'Client profile not found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateClientRequestDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ClientProfileDto> {
    await this.authenticateAndAuthorize(req, 'write');

    let expectedVersion = body.expectedVersion;
    const ifMatchHeader = req.headers['if-match'];
    if (ifMatchHeader) {
      const rawVersionStr = Array.isArray(ifMatchHeader) ? ifMatchHeader[0] : ifMatchHeader;
      const cleanVersionStr = rawVersionStr.replace(/"/g, '').trim();
      const parsedVersion = parseInt(cleanVersionStr, 10);
      if (!isNaN(parsedVersion)) {
        expectedVersion = parsedVersion;
      }
    }

    if (expectedVersion === undefined || expectedVersion === null) {
      throw new BadRequestException(
        'Expected version must be specified via If-Match header or expectedVersion body parameter.',
      );
    }

    const command = new UpdateClientCommand({
      clientId: id,
      expectedVersion,
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      phone: body.phone,
    });

    const updatedProfile = await this.updateClientUseCase.execute(command);
    res.setHeader('ETag', `"${updatedProfile.version}"`);
    return updatedProfile;
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archive client profile' })
  @ApiResponse({
    status: 200,
    description: 'Client profile archived successfully',
    type: ClientProfileDto,
  })
  @ApiResponse({ status: 404, description: 'Client profile not found' })
  @ApiResponse({ status: 409, description: 'Conflict (client is already archived)' })
  @ApiResponse({ status: 403, description: 'Forbidden (insufficient permissions)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async archive(
    @Param('id') id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ClientProfileDto> {
    await this.authenticateAndAuthorize(req, 'archive');

    let expectedVersion: number | undefined;
    const ifMatchHeader = req.headers['if-match'];
    if (ifMatchHeader) {
      const rawVersionStr = Array.isArray(ifMatchHeader) ? ifMatchHeader[0] : ifMatchHeader;
      const cleanVersionStr = rawVersionStr.replace(/"/g, '').trim();
      const parsedVersion = parseInt(cleanVersionStr, 10);
      if (!isNaN(parsedVersion)) {
        expectedVersion = parsedVersion;
      }
    }

    const command = new ArchiveClientCommand({
      clientId: id,
      expectedVersion,
    });

    const updatedProfile = await this.archiveClientUseCase.execute(command);
    res.setHeader('ETag', `"${updatedProfile.version}"`);
    return updatedProfile;
  }

  @Patch(':id/restore')
  @ApiOperation({ summary: 'Restore archived client profile' })
  @ApiResponse({
    status: 200,
    description: 'Client profile restored successfully',
    type: ClientProfileDto,
  })
  @ApiResponse({ status: 404, description: 'Client profile not found' })
  @ApiResponse({ status: 409, description: 'Conflict (client is already active)' })
  @ApiResponse({ status: 403, description: 'Forbidden (insufficient permissions)' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async restore(
    @Param('id') id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<ClientProfileDto> {
    await this.authenticateAndAuthorize(req, 'archive');

    let expectedVersion: number | undefined;
    const ifMatchHeader = req.headers['if-match'];
    if (ifMatchHeader) {
      const rawVersionStr = Array.isArray(ifMatchHeader) ? ifMatchHeader[0] : ifMatchHeader;
      const cleanVersionStr = rawVersionStr.replace(/"/g, '').trim();
      const parsedVersion = parseInt(cleanVersionStr, 10);
      if (!isNaN(parsedVersion)) {
        expectedVersion = parsedVersion;
      }
    }

    const command = new RestoreClientCommand({
      clientId: id,
      expectedVersion,
    });

    const updatedProfile = await this.restoreClientUseCase.execute(command);
    res.setHeader('ETag', `"${updatedProfile.version}"`);
    return updatedProfile;
  }

  @Post()
  @ApiOperation({ summary: 'Register a new client profile' })
  @ApiResponse({
    status: 201,
    description: 'Client registered successfully',
    type: ClientResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'Hard duplicate rejection or soft duplicate potential matches detected',
    type: PotentialMatchesResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request payload' })
  async register(
    @Body() body: RegisterClientRequestDto,
    @Res() res: Response,
    @Req() req?: Request,
  ): Promise<void> {
    await this.authenticateAndAuthorize(req, 'write');
    let identityId = body.identityId ?? null;

    if (!identityId) {
      try {
        // Extract identityId from RequestContext if executing within active API request context
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const reqContextModule = (global as any).RequestContext;
        if (reqContextModule?.currentIdentity) {
          identityId = reqContextModule.currentIdentity()?.userId ?? null;
        }
      } catch {
        // RequestContext inactive or unavailable
      }
    }

    const command = new RegisterClientCommand({
      firstName: body.firstName,
      lastName: body.lastName,
      email: body.email,
      phone: body.phone,
      identityId,
      bypassSoftDuplicates: body.bypassSoftDuplicates ?? false,
    });

    const result = await this.registerClientUseCase.execute(command);

    if (result.isPotentialDuplicates && result.potentialMatches) {
      res
        .status(HttpStatus.CONFLICT)
        .json(PotentialMatchesResponseDto.fromDomainMatches(result.potentialMatches));
      return;
    }

    res.status(HttpStatus.CREATED).json(ClientResponseDto.fromDomain(result.client!));
  }

  @Post(':id/link-identity')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Link an authenticated identity to an existing client profile' })
  @ApiResponse({
    status: 200,
    description: 'Identity linked successfully to client profile',
    type: ClientResponseDto,
  })
  @ApiResponse({ status: 409, description: 'Client is already linked to an identity' })
  @ApiResponse({ status: 404, description: 'Client profile not found' })
  async linkIdentity(
    @Param('id') id: string,
    @Body() body: LinkIdentityRequestDto,
    @Req() req?: Request,
  ): Promise<ClientResponseDto> {
    await this.authenticateAndAuthorize(req, 'write');
    const command = new LinkIdentityCommand({
      clientId: id,
      identityId: body.identityId,
    });

    const updatedClient = await this.linkIdentityUseCase.execute(command);
    return ClientResponseDto.fromDomain(updatedClient);
  }
}
