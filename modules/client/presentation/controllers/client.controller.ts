import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { RegisterClientUseCase } from '../../application/use-cases/register-client.usecase';
import { LinkIdentityToClientUseCase } from '../../application/use-cases/link-identity-to-client.usecase';
import { GetClientProfileUseCase } from '../../application/use-cases/get-client-profile.usecase';
import { SearchClientsUseCase } from '../../application/use-cases/search-clients.usecase';
import { UpdateClientUseCase } from '../../application/use-cases/update-client.usecase';
import { RegisterClientCommand } from '../../application/commands/register-client.command';
import { LinkIdentityCommand } from '../../application/commands/link-identity.command';
import { UpdateClientCommand } from '../../application/commands/update-client.command';
import { GetClientProfileQuery } from '../../application/queries/get-client-profile.query';
import { SearchClientsQuery } from '../../application/queries/search-clients.query';
import { ClientProfileDto } from '../../application/dto/client-profile.dto';
import { PaginatedResultDto } from '../../application/dto/paginated-result.dto';
import {
  ClientResponseDto,
  LinkIdentityRequestDto,
  PotentialMatchesResponseDto,
  RegisterClientRequestDto,
  SearchClientsQueryDto,
  UpdateClientRequestDto,
} from '../dto';
import { ClientExceptionFilter } from '../filters/client-exception.filter';

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
  ) {}

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userPayload = (req as any).user;

    if (!userPayload) {
      const authHeader = req.headers?.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException('Authentication token required.');
      }
    }

    const requestingContext = userPayload
      ? {
          userId: userPayload.userId ?? userPayload.id,
          roles: userPayload.roles,
          permissions: userPayload.permissions,
        }
      : undefined;

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userPayload = (req as any).user;

    if (!userPayload) {
      const authHeader = req.headers?.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException('Authentication token required.');
      }
    }

    const requestingContext = userPayload
      ? {
          userId: userPayload.userId ?? userPayload.id,
          roles: userPayload.roles,
          permissions: userPayload.permissions,
        }
      : undefined;

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const userPayload = (req as any).user;

    if (!userPayload) {
      const authHeader = req.headers?.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException('Authentication token required.');
      }
    }

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
  async register(@Body() body: RegisterClientRequestDto, @Res() res: Response): Promise<void> {
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
  ): Promise<ClientResponseDto> {
    const command = new LinkIdentityCommand({
      clientId: id,
      identityId: body.identityId,
    });

    const updatedClient = await this.linkIdentityUseCase.execute(command);
    return ClientResponseDto.fromDomain(updatedClient);
  }
}
