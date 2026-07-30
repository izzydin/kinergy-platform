import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { RegisterClientUseCase } from '../../application/use-cases/register-client.usecase';
import { LinkIdentityToClientUseCase } from '../../application/use-cases/link-identity-to-client.usecase';
import { RegisterClientCommand } from '../../application/commands/register-client.command';
import { LinkIdentityCommand } from '../../application/commands/link-identity.command';
import {
  ClientResponseDto,
  LinkIdentityRequestDto,
  PotentialMatchesResponseDto,
  RegisterClientRequestDto,
} from '../dto';
import { ClientExceptionFilter } from '../filters/client-exception.filter';

@ApiTags('Clients')
@Controller('clients')
@UseFilters(ClientExceptionFilter)
export class ClientController {
  constructor(
    private readonly registerClientUseCase: RegisterClientUseCase,
    private readonly linkIdentityUseCase: LinkIdentityToClientUseCase,
  ) {}

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
