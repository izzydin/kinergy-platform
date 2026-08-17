import {
  Controller,
  Post,
  Put,
  Get,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  UnprocessableEntityException,
  BadRequestException,
} from '@nestjs/common';
import { Permissions } from '../../platform/identity/decorators';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import {
  AssignTherapistToSessionHandler,
  AssignTherapistToSessionCommand,
  UpdateSessionNotesHandler,
  UpdateSessionNotesCommand,
  GetClientTreatmentHistoryHandler,
  GetClientTreatmentHistoryQuery,
  SessionStatus,
} from '@kinergy-platform/core';

export class AssignTherapistDto {
  newTherapistId!: string;
}

export class UpdateSessionNotesDto {
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  rawText?: string;
}

export class TreatmentHistoryQueryDto {
  page?: number;
  limit?: number;
  status?: string;
  therapistId?: string;
  dateFrom?: string;
  dateTo?: string;
}

@Controller('kinesiology')
@UseGuards(AuthorizationGuard)
export class TreatmentSessionsController {
  constructor(
    private readonly assignTherapistHandler: AssignTherapistToSessionHandler,
    private readonly updateNotesHandler: UpdateSessionNotesHandler,
    private readonly getHistoryHandler: GetClientTreatmentHistoryHandler,
  ) {}

  @Post('sessions/:id/assign-therapist')
  @HttpCode(HttpStatus.OK)
  @Permissions('kinesiology.sessions.assign')
  public async assignTherapist(@Param('id') sessionId: string, @Body() dto: AssignTherapistDto) {
    if (!dto?.newTherapistId) {
      throw new BadRequestException('newTherapistId is required.');
    }

    const command = new AssignTherapistToSessionCommand({
      sessionId,
      newTherapistId: dto.newTherapistId,
    });

    const result = await this.assignTherapistHandler.execute(command);

    if (result.isFailure) {
      const error = result.getError();
      if (error.includes('not found')) {
        throw new NotFoundException(error);
      }
      if (error.includes('empty')) {
        throw new BadRequestException(error);
      }
      throw new UnprocessableEntityException(error);
    }

    return result.getValue();
  }

  @Put('sessions/:id/notes')
  @HttpCode(HttpStatus.OK)
  @Permissions('kinesiology.sessions.treat')
  public async updateNotes(@Param('id') sessionId: string, @Body() dto: UpdateSessionNotesDto) {
    const command = new UpdateSessionNotesCommand({
      sessionId,
      notes: dto,
    });

    const result = await this.updateNotesHandler.execute(command);

    if (result.isFailure) {
      const error = result.getError();
      if (error.includes('not found')) {
        throw new NotFoundException(error);
      }
      if (error.includes('empty')) {
        throw new BadRequestException(error);
      }
      throw new UnprocessableEntityException(error);
    }

    return result.getValue();
  }

  @Get('clients/:clientId/treatment-history')
  @HttpCode(HttpStatus.OK)
  @Permissions('kinesiology.sessions.read')
  public async getTreatmentHistory(
    @Param('clientId') clientId: string,
    @Query() queryDto: TreatmentHistoryQueryDto,
  ) {
    if (!clientId || clientId.trim().length === 0) {
      throw new BadRequestException('Client ID cannot be empty.');
    }

    const dateFrom = queryDto.dateFrom ? new Date(queryDto.dateFrom) : undefined;
    const dateTo = queryDto.dateTo ? new Date(queryDto.dateTo) : undefined;

    if (dateFrom && isNaN(dateFrom.getTime())) {
      throw new BadRequestException('Invalid dateFrom parameter.');
    }
    if (dateTo && isNaN(dateTo.getTime())) {
      throw new BadRequestException('Invalid dateTo parameter.');
    }

    let statusEnum: SessionStatus | undefined;
    if (queryDto.status) {
      if (!Object.values(SessionStatus).includes(queryDto.status as SessionStatus)) {
        throw new BadRequestException(`Invalid session status: '${queryDto.status}'.`);
      }
      statusEnum = queryDto.status as SessionStatus;
    }

    const query = new GetClientTreatmentHistoryQuery({
      clientId,
      page: queryDto.page ? Number(queryDto.page) : undefined,
      limit: queryDto.limit ? Number(queryDto.limit) : undefined,
      status: statusEnum,
      therapistId: queryDto.therapistId,
      dateFrom,
      dateTo,
    });

    const result = await this.getHistoryHandler.execute(query);

    if (result.isFailure) {
      throw new BadRequestException(result.getError());
    }

    return result.getValue();
  }
}
