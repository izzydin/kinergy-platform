import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { AiFailureClassifier } from '@kinergy-platform/core';

/**
 * Centralized NestJS Exception Filter translating pure application and domain errors
 * from all AI module subsystems (Conversations, Grounded Generation, Documents, Ingestion, Health)
 * into standard, secure, typed HTTP responses.
 *
 * Guarantees:
 * - Deterministic HTTP status and machine-readable code mapping using AiFailureClassifier.
 * - Complete redaction of internal stack traces, Prisma details, SQL queries, and prompt content.
 * - Uniform JSON response schema conforming to the platform AiErrorResponseDto contract.
 * - Authoritative retryability indication and Retry-After header provisioning.
 * - Distributed request/correlation tracking via request headers and response metadata.
 */
@Catch()
export class AiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = typeof ctx.getRequest === 'function' ? ctx.getRequest<Request>() : undefined;

    // 1. Authoritative Failure Classification
    const classified = AiFailureClassifier.classify(exception);

    // 2. Correlation & Request Tracing Identifiers
    const incomingCorrelationId = (request?.headers?.['x-correlation-id'] ||
      request?.headers?.['x-request-id'] ||
      request?.headers?.['correlation-id']) as string | undefined;

    const correlationId = incomingCorrelationId || randomUUID();

    if (typeof response.setHeader === 'function') {
      response.setHeader('x-correlation-id', correlationId);
      response.setHeader('x-request-id', correlationId);
    }

    // 3. Retry-After Header Handling
    if (classified.retryAfterSeconds && typeof response.setHeader === 'function') {
      response.setHeader('Retry-After', String(classified.retryAfterSeconds));
    }

    // 4. Secure Diagnostic Server Logging
    const logPrefix = correlationId ? `[${correlationId}] ` : '';
    const sanitizedUrl = this.sanitizeUrl(request?.url);
    const sanitizedLogMessage = this.sanitizeLogMessage(
      exception instanceof Error ? exception.message : classified.message,
    );

    const rawStack = exception instanceof Error ? exception.stack : undefined;
    const sanitizedStack = rawStack ? this.sanitizeLogMessage(rawStack) : undefined;

    const logEntry = `${logPrefix}HTTP ${classified.statusCode} [${classified.category}/${classified.code}]: ${sanitizedLogMessage} Path: ${sanitizedUrl}`;

    if (classified.statusCode >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(logEntry, sanitizedStack);
    } else if (classified.statusCode >= HttpStatus.BAD_REQUEST) {
      this.logger.warn(logEntry);
    }

    // 5. Standardized Client Response Payload
    const path = request?.url ?? '';
    const timestamp = new Date().toISOString();

    response.status(classified.statusCode).json({
      statusCode: classified.statusCode,
      error: classified.errorTitle,
      code: classified.code,
      message: classified.message,
      timestamp,
      path,
      ...(correlationId ? { correlationId } : {}),
      retryable: classified.isRetryable,
      ...(classified.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: classified.retryAfterSeconds }
        : {}),
      ...(classified.details ? { details: classified.details } : {}),
    });
  }

  private sanitizeLogMessage(message: unknown): string {
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
