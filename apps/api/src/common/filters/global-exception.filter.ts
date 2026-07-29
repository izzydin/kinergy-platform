import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  AccountDisabledException,
  AuthException,
  InvalidCredentialsException,
  InvalidTokenException,
} from '../../platform/identity/use-cases/exceptions/auth.exception';
import { SecurityConfigurationException } from '../../config/security-configuration.exception';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Internal server error';

    if (
      exception instanceof InvalidCredentialsException ||
      exception instanceof AccountDisabledException
    ) {
      status = HttpStatus.UNAUTHORIZED;
      message = { statusCode: 401, error: 'Unauthorized', message: 'Invalid email or password.' };
    } else if (exception instanceof InvalidTokenException) {
      status = HttpStatus.UNAUTHORIZED;
      message = { statusCode: 401, error: 'Unauthorized', message: 'Invalid or expired token.' };
    } else if (exception instanceof AuthException) {
      status = HttpStatus.UNAUTHORIZED;
      message = { statusCode: 401, error: 'Unauthorized', message: 'Authentication failed.' };
    } else if (exception instanceof SecurityConfigurationException) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = {
        statusCode: 500,
        error: 'Internal Server Error',
        message: 'Security configuration error.',
      };
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.getResponse();
    }

    this.logger.error(
      `Http Status: ${status} Error Message: ${JSON.stringify(message)} Path: ${request.url}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      error: typeof message === 'object' ? message : { message },
    });
  }
}
