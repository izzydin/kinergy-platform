import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import {
  ClientAlreadyExistsException,
  ClientNotFoundException,
} from '../../application/exceptions/client-already-exists.exception';
import {
  ArchivedClientCannotBeModifiedException,
  ClientAlreadyLinkedException,
  ClientDomainException,
  OptimisticLockException,
} from '../../domain/errors/client-domain.exception';

@Catch()
export class ClientExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof OptimisticLockException) {
      response.status(HttpStatus.PRECONDITION_FAILED).json({
        statusCode: HttpStatus.PRECONDITION_FAILED,
        error: 'Precondition Failed',
        message: exception.message,
      });
      return;
    }

    if (exception instanceof ArchivedClientCannotBeModifiedException) {
      response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'Unprocessable Entity',
        message: exception.message,
      });
      return;
    }

    if (
      exception instanceof ClientAlreadyExistsException ||
      exception instanceof ClientAlreadyLinkedException
    ) {
      response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: exception.message,
      });
      return;
    }

    if (exception instanceof ClientNotFoundException) {
      response.status(HttpStatus.NOT_FOUND).json({
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        message: exception.message,
      });
      return;
    }

    if (exception instanceof ClientDomainException) {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        message: exception.message,
      });
      return;
    }

    // Re-throw unhandled exceptions so standard NestJS handlers process them
    throw exception;
  }
}
