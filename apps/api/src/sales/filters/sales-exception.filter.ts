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
  SaleDomainException,
  InvalidMoneyException,
  InvalidDiscountException,
  InvalidSaleItemException,
  EmptySaleException,
  SaleAlreadyFinalizedException,
  SaleOptimisticLockException,
  PaymentOptimisticLockException,
  ReceiptOptimisticLockException,
  DuplicateReceiptException,
  DuplicateSaleException,
  DuplicatePaymentReferenceException,
  InvalidSaleTransitionException,
  InvalidSaleStateException,
  SaleNotFoundException,
  PaymentNotFoundException,
  ReceiptNotFoundException,
  SaleNotPayableException,
  PaymentOverpaymentException,
  PaymentUnauthorizedException,
  ReceiptUnauthorizedException,
  SaleUnauthorizedException,
  PaymentCurrencyMismatchException,
  InvalidPaymentMethodException,
  InvalidPaymentReferenceException,
  InvalidPaymentStatusException,
  InvalidPaymentTransitionException,
  PaymentDomainException,
  ReceiptDomainException,
  ReceiptIssuanceRejectedException,
  PaymentSaleConsistencyException,
  PaymentSaleMismatchException,
} from '@kinergy-platform/core';
import {
  AccountDisabledException,
  AuthException,
  InvalidCredentialsException,
  InvalidTokenException,
} from '../../platform/identity/use-cases/exceptions/auth.exception';
import { SecurityConfigurationException } from '../../config/security-configuration.exception';

/**
 * Enterprise Exception Filter translating Domain Sales, Payment & Monetary Invariant Exceptions
 * into standard HTTP response envelopes with RFC-compliant status codes.
 * Standardizes authentication, authorization, domain validation, and unexpected infrastructure failures.
 */
@Catch()
export class SalesExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SalesExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = typeof ctx.getRequest === 'function' ? ctx.getRequest<Request>() : undefined;

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
    const method = request?.method ?? 'UNKNOWN';
    const sanitizedUrl = this.sanitizeUrl(request?.url);

    // 0. Security Configuration Errors (500 Internal Server Error)
    if (exception instanceof SecurityConfigurationException) {
      const sanitizedStack = exception.stack ? this.sanitizeMessage(exception.stack) : undefined;
      this.logger.error(
        `${logPrefix}${method} ${sanitizedUrl} - Status: ${HttpStatus.INTERNAL_SERVER_ERROR} - Security Configuration Error: ${this.sanitizeMessage(exception.message)}`,
        sanitizedStack,
      );

      response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
        message: 'Security configuration error.',
      });
      return;
    }

    // 0b. Identity & Authentication Failures (401 Unauthorized)
    if (
      exception instanceof InvalidCredentialsException ||
      exception instanceof AccountDisabledException
    ) {
      this.logger.warn(
        `${logPrefix}${method} ${sanitizedUrl} - Status: ${HttpStatus.UNAUTHORIZED} - Invalid Credentials`,
      );

      response.status(HttpStatus.UNAUTHORIZED).json({
        statusCode: HttpStatus.UNAUTHORIZED,
        error: 'Unauthorized',
        message: 'Invalid email or password.',
      });
      return;
    }

    if (exception instanceof InvalidTokenException) {
      this.logger.warn(
        `${logPrefix}${method} ${sanitizedUrl} - Status: ${HttpStatus.UNAUTHORIZED} - Invalid Token`,
      );

      response.status(HttpStatus.UNAUTHORIZED).json({
        statusCode: HttpStatus.UNAUTHORIZED,
        error: 'Unauthorized',
        message: 'Invalid or expired token.',
      });
      return;
    }

    if (exception instanceof AuthException) {
      this.logger.warn(
        `${logPrefix}${method} ${sanitizedUrl} - Status: ${HttpStatus.UNAUTHORIZED} - Authentication Failed: ${this.sanitizeMessage(exception.message)}`,
      );

      response.status(HttpStatus.UNAUTHORIZED).json({
        statusCode: HttpStatus.UNAUTHORIZED,
        error: 'Unauthorized',
        message: 'Authentication failed.',
      });
      return;
    }

    // 1. Optimistic Concurrency & Lock Collisions (409 Conflict)
    const rawCode =
      exception && typeof exception === 'object' && 'code' in exception
        ? String((exception as { code: unknown }).code)
        : undefined;

    if (
      exception instanceof SaleOptimisticLockException ||
      exception instanceof PaymentOptimisticLockException ||
      exception instanceof ReceiptOptimisticLockException ||
      exception instanceof DuplicateReceiptException ||
      exception instanceof DuplicateSaleException ||
      exception instanceof DuplicatePaymentReferenceException ||
      rawCode === 'P2002' ||
      rawCode === '23505' ||
      rawCode === 'P2034'
    ) {
      const code = rawCode && !['P2002', '23505', 'P2034'].includes(rawCode) ? rawCode : 'CONFLICT';

      const sanitizedMsg =
        rawCode === 'P2002' || rawCode === '23505' || rawCode === 'P2034'
          ? 'A concurrent transaction or duplicate entity conflict occurred.'
          : this.sanitizeMessage(
              exception instanceof Error ? exception.message : String(exception),
            );

      this.logger.warn(
        `${logPrefix}${method} ${sanitizedUrl} - Status: ${HttpStatus.CONFLICT} - Conflict: ${sanitizedMsg}`,
      );

      response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code,
        message: sanitizedMsg,
      });
      return;
    }

    if (
      exception instanceof SaleAlreadyFinalizedException ||
      (exception instanceof InvalidSaleStateException &&
        (exception.code === 'SALE_SOURCE_IMMUTABLE' ||
          exception.code === 'CANNOT_MODIFY_CANCELLED_SALE' ||
          exception.code === 'TERMINAL_SALE_IMMUTABLE'))
    ) {
      const code =
        'code' in exception && typeof (exception as { code: unknown }).code === 'string'
          ? (exception as { code: string }).code
          : 'CONFLICT';

      const sanitizedMsg = this.sanitizeMessage(exception.message);
      this.logger.warn(
        `${logPrefix}${method} ${sanitizedUrl} - Status: ${HttpStatus.CONFLICT} - Conflict: ${sanitizedMsg}`,
      );

      response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code,
        message: sanitizedMsg,
      });
      return;
    }

    // 2. Not Found Entities (404 Not Found)
    if (
      exception instanceof SaleNotFoundException ||
      exception instanceof PaymentNotFoundException ||
      exception instanceof ReceiptNotFoundException ||
      rawCode === 'P2025' ||
      (exception instanceof Error &&
        (exception.name === 'SourceNotFoundException' ||
          exception.name === 'ClientNotFoundException'))
    ) {
      const sanitizedMsg =
        rawCode === 'P2025'
          ? 'The requested resource was not found.'
          : this.sanitizeMessage(
              exception instanceof Error ? exception.message : String(exception),
            );

      this.logger.warn(
        `${logPrefix}${method} ${sanitizedUrl} - Status: ${HttpStatus.NOT_FOUND} - Resource Not Found: ${sanitizedMsg}`,
      );

      response.status(HttpStatus.NOT_FOUND).json({
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        message: sanitizedMsg,
      });
      return;
    }

    // 3. Security & Multi-Tenant Authorization (403 Forbidden)
    if (
      exception instanceof PaymentUnauthorizedException ||
      exception instanceof ReceiptUnauthorizedException ||
      exception instanceof SaleUnauthorizedException
    ) {
      const sanitizedMsg = this.sanitizeMessage(exception.message);
      this.logger.warn(
        `${logPrefix}${method} ${sanitizedUrl} - Status: ${HttpStatus.FORBIDDEN} - Authorization Denied: ${sanitizedMsg}`,
      );

      response.status(HttpStatus.FORBIDDEN).json({
        statusCode: HttpStatus.FORBIDDEN,
        error: 'Forbidden',
        message: sanitizedMsg,
      });
      return;
    }

    // 4. Invariant & Lifecycle Violations (422 Unprocessable Entity)
    if (
      exception instanceof EmptySaleException ||
      exception instanceof InvalidSaleTransitionException ||
      exception instanceof InvalidPaymentTransitionException ||
      exception instanceof SaleNotPayableException ||
      exception instanceof PaymentOverpaymentException ||
      exception instanceof ReceiptIssuanceRejectedException
    ) {
      const code =
        'code' in exception && typeof (exception as { code: unknown }).code === 'string'
          ? (exception as { code: string }).code
          : 'UNPROCESSABLE_ENTITY';

      const sanitizedMsg = this.sanitizeMessage(exception.message);
      this.logger.warn(
        `${logPrefix}${method} ${sanitizedUrl} - Status: ${HttpStatus.UNPROCESSABLE_ENTITY} - Lifecycle Invariant: ${sanitizedMsg}`,
      );

      response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'Unprocessable Entity',
        code,
        message: sanitizedMsg,
      });
      return;
    }

    // 5. Malformed Request / Validation Domain Violations (400 Bad Request)
    if (
      exception instanceof InvalidMoneyException ||
      exception instanceof InvalidDiscountException ||
      exception instanceof InvalidSaleItemException ||
      exception instanceof InvalidSaleStateException ||
      exception instanceof PaymentCurrencyMismatchException ||
      exception instanceof InvalidPaymentMethodException ||
      exception instanceof InvalidPaymentReferenceException ||
      exception instanceof InvalidPaymentStatusException ||
      exception instanceof PaymentDomainException ||
      exception instanceof ReceiptDomainException ||
      exception instanceof SaleDomainException ||
      exception instanceof PaymentSaleConsistencyException ||
      exception instanceof PaymentSaleMismatchException
    ) {
      const code =
        'code' in exception && typeof (exception as { code: unknown }).code === 'string'
          ? (exception as { code: string }).code
          : 'BAD_REQUEST';

      const sanitizedMsg = this.sanitizeMessage(exception.message);
      this.logger.warn(
        `${logPrefix}${method} ${sanitizedUrl} - Status: ${HttpStatus.BAD_REQUEST} - Validation Invariant: ${sanitizedMsg}`,
      );

      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        code,
        message: sanitizedMsg,
      });
      return;
    }

    // 6. Native NestJS HTTP Exceptions
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resPayload = exception.getResponse();

      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        const sanitizedStack = exception.stack ? this.sanitizeMessage(exception.stack) : undefined;
        this.logger.error(
          `${logPrefix}${method} ${sanitizedUrl} - Status: ${status} - Server Error: ${this.sanitizeMessage(exception.message)}`,
          sanitizedStack,
        );

        response.status(status).json({
          statusCode: status,
          error: 'Internal Server Error',
          message: 'An unexpected internal server error occurred.',
        });
        return;
      }

      const sanitizedMsg = this.sanitizeMessage(exception.message);
      this.logger.warn(
        `${logPrefix}${method} ${sanitizedUrl} - Status: ${status} - Client Error: ${sanitizedMsg}`,
      );

      const sanitizedPayload =
        typeof resPayload === 'object' && resPayload !== null
          ? this.sanitizePayload(resPayload as Record<string, unknown>)
          : { statusCode: status, message: sanitizedMsg };

      response.status(status).json(sanitizedPayload);
      return;
    }

    // 7. Unexpected Infrastructure & Database Failures (500 Internal Server Error)
    // Never expose stack traces, secrets, SQL errors, or Prisma exceptions in HTTP responses
    const rawErrorMessage = exception instanceof Error ? exception.message : String(exception);
    const rawStack = exception instanceof Error ? exception.stack : undefined;
    const sanitizedStack = rawStack ? this.sanitizeMessage(rawStack) : undefined;

    this.logger.error(
      `${logPrefix}${method} ${sanitizedUrl} - Status: ${HttpStatus.INTERNAL_SERVER_ERROR} - Infrastructure Error: ${this.sanitizeMessage(rawErrorMessage)}`,
      sanitizedStack,
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      message: 'An unexpected internal server error occurred.',
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

  private sanitizePayload(payload: Record<string, unknown>): Record<string, unknown> {
    const copy = { ...payload };
    if (typeof copy.message === 'string') {
      copy.message = this.sanitizeMessage(copy.message);
    } else if (Array.isArray(copy.message)) {
      copy.message = copy.message.map((m) => (typeof m === 'string' ? this.sanitizeMessage(m) : m));
    }
    return copy;
  }
}
