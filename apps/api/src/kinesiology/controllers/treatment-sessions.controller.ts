import {
  Controller,
  Post,
  Param,
  Body,
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
} from '@kinergy-platform/core';

export class AssignTherapistDto {
  newTherapistId!: string;
}

@Controller('kinesiology/sessions')
@UseGuards(AuthorizationGuard)
export class TreatmentSessionsController {
  constructor(private readonly assignTherapistHandler: AssignTherapistToSessionHandler) {}

  @Post(':id/assign-therapist')
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
}
