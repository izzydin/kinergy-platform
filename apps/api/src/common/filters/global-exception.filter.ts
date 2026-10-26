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
    const request = typeof ctx.getRequest === 'function' ? ctx.getRequest<Request>() : undefined;

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
      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        message = {
          statusCode: status,
          error: 'Internal Server Error',
          message: 'Internal server error',
        };
      } else {
        message = exception.getResponse();
      }
    }

    const correlationId = (request?.headers?.['x-correlation-id'] ||
      request?.headers?.['x-request-id'] ||
      request?.headers?.['correlation-id']) as string | undefined;

    if (correlationId && typeof response.setHeader === 'function') {
      response.setHeader('x-correlation-id', correlationId);
      if (request?.headers?.['x-request-id']) {
        response.setHeader('x-request-id', request.headers['x-request-id'] as string);
      }
    }

    const logPrefix = correlationId ? `[${correlationId}] ` : '';
    const sanitizedUrl = this.sanitizeUrl(request?.url);
    const sanitizedLogMessage = this.sanitizeMessage(message);

    const rawStack = exception instanceof Error ? exception.stack : undefined;
    const sanitizedStack = rawStack ? this.sanitizeMessage(rawStack) : undefined;

    this.logger.error(
      `${logPrefix}Http Status: ${status} Error Message: ${sanitizedLogMessage} Path: ${sanitizedUrl}`,
      sanitizedStack,
    );

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request?.url ?? '',
      error: typeof message === 'object' ? message : { message },
    });
  }

  private sanitizeMessage(message: unknown): string {
    if (!message) return '';
    let str = typeof message === 'object' ? JSON.stringify(message) : String(message);
    str = str.replace(/\b(?:\d[ -]*?){13,19}\b/g, '****-****-****-[MASKED]');
    str = str.replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, 'Bearer [REDACTED]');
    str = str.replace(/eyJ[A-Za-z0-9\-_.]+/g, '[REDACTED_TOKEN]');
    str = str.replace(
      /(postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s"']+/gi,
      '$1://[REDACTED_DATABASE_URL]',
    );
    str = str.replace(
      /(password(?:_hash)?|secret|access_token|refresh_token)\s*[:=]\s*['"]?[^\s,'"]+['"]?/gi,
      '$1: [REDACTED]',
    );
    return str;
  }

  private sanitizeUrl(url?: string): string {
    if (!url) return '';
    return url.replace(
      /([?&](token|access_token|refresh_token|secret|password)=)[^&]+/gi,
      '$1[REDACTED]',
    );
  }
}
