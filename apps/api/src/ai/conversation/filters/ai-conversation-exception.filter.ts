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
  AiConversationApplicationError,
  ConversationNotFoundError,
  TurnNotFoundError,
  MessageNotFoundError,
  TenantOwnershipViolationError,
  InvalidTurnInputError,
  DuplicateClientTurnPayloadMismatchError,
  TurnAlreadyInProgressError,
  InvalidConversationLifecycleError,
  InvalidMessageOperationError,
  PersistenceConflictError,
  TransactionFailureError,
  TransientTransactionFailureError,
  ConversationNotFoundException,
  TurnNotFoundException,
  MessageNotFoundException,
  DuplicateEntityException,
  InvalidOwnershipException,
  InvalidConversationTurnException,
  InvalidMessageInvariantException,
  InvalidCursorException,
  ConversationPersistenceException,
} from '@kinergy-platform/core';

/**
 * Centralized NestJS Exception Filter translating pure application and domain errors
 * from the AI Conversation persistence context into standard, secure HTTP responses.
 *
 * Guarantees:
 * - Deterministic HTTP status mapping based exclusively on typed error instances.
 * - Complete redaction of internal stack traces, Prisma details, SQL queries, and prompt content.
 * - Standard JSON response schema conforming to the platform API error conventions.
 */
@Catch()
export class AiConversationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AiConversationExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = typeof ctx.getRequest === 'function' ? ctx.getRequest<Request>() : undefined;

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorTitle = 'Internal Server Error';
    let errorCode = 'AI_INTERNAL_ERROR';
    let errorMessage = 'An unexpected error occurred during AI conversation processing.';

    // 1. Not Found (404)
    if (
      exception instanceof ConversationNotFoundError ||
      exception instanceof TurnNotFoundError ||
      exception instanceof MessageNotFoundError ||
      exception instanceof ConversationNotFoundException ||
      exception instanceof TurnNotFoundException ||
      exception instanceof MessageNotFoundException
    ) {
      statusCode = HttpStatus.NOT_FOUND;
      errorTitle = 'Not Found';
      errorCode =
        exception instanceof AiConversationApplicationError ? exception.code : 'AI_NOT_FOUND';
      errorMessage = exception.message;
    }
    // 2. Bad Request / Validation Failure (400)
    else if (
      exception instanceof InvalidTurnInputError ||
      exception instanceof InvalidConversationLifecycleError ||
      exception instanceof InvalidMessageOperationError ||
      exception instanceof InvalidConversationTurnException ||
      exception instanceof InvalidMessageInvariantException ||
      exception instanceof InvalidCursorException
    ) {
      statusCode = HttpStatus.BAD_REQUEST;
      errorTitle = 'Bad Request';
      errorCode =
        exception instanceof AiConversationApplicationError
          ? exception.code
          : exception instanceof InvalidCursorException
            ? 'AI_INVALID_CURSOR'
            : 'AI_BAD_REQUEST';
      errorMessage = exception.message;
    }
    // 3. Conflict (409)
    else if (
      exception instanceof DuplicateClientTurnPayloadMismatchError ||
      exception instanceof TurnAlreadyInProgressError ||
      exception instanceof DuplicateEntityException ||
      exception instanceof PersistenceConflictError
    ) {
      statusCode = HttpStatus.CONFLICT;
      errorTitle = 'Conflict';
      errorCode =
        exception instanceof AiConversationApplicationError ? exception.code : 'AI_CONFLICT';
      errorMessage = exception.message;

      // Provide bounded Retry-After recommendation header for concurrent turn in progress
      if (exception instanceof TurnAlreadyInProgressError) {
        response.setHeader('Retry-After', '2');
      }
    }
    // 4. Forbidden / Ownership Violation (403)
    else if (
      exception instanceof TenantOwnershipViolationError ||
      exception instanceof InvalidOwnershipException
    ) {
      statusCode = HttpStatus.FORBIDDEN;
      errorTitle = 'Forbidden';
      errorCode =
        exception instanceof AiConversationApplicationError ? exception.code : 'AI_FORBIDDEN';
      errorMessage = exception.message;
    }
    // 5. Transient Database Failure (503)
    else if (exception instanceof TransientTransactionFailureError) {
      statusCode = HttpStatus.SERVICE_UNAVAILABLE;
      errorTitle = 'Service Unavailable';
      errorCode = exception.code;
      errorMessage =
        'Database transaction failed due to concurrent conflicts after retry attempts. Please retry shortly.';
      response.setHeader('Retry-After', '1');
    }
    // 6. Generic Transaction / Persistence Failure (500)
    else if (
      exception instanceof TransactionFailureError ||
      exception instanceof ConversationPersistenceException
    ) {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      errorTitle = 'Internal Server Error';
      errorCode =
        exception instanceof AiConversationApplicationError
          ? exception.code
          : 'AI_PERSISTENCE_FAILURE';
      errorMessage = 'A database persistence error occurred. Please try again.';
    }
    // 7. Standard NestJS HttpExceptions (pass-through)
    else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const resPayload = exception.getResponse();
      if (typeof resPayload === 'object' && resPayload !== null) {
        const payloadObj = resPayload as Record<string, unknown>;
        errorTitle = String(payloadObj['error'] ?? 'Http Error');
        errorMessage = String(payloadObj['message'] ?? exception.message);
        errorCode = String(payloadObj['code'] ?? `HTTP_${statusCode}`);
      } else {
        errorMessage = String(resPayload);
        errorTitle = 'Http Error';
        errorCode = `HTTP_${statusCode}`;
      }
    }
    // 8. Other Uncaught Exceptions (500)
    else {
      this.logger.error(
        `Uncaught error in AI conversation flow: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    const path = request?.url ?? '';
    const timestamp = new Date().toISOString();

    response.status(statusCode).json({
      statusCode,
      error: errorTitle,
      code: errorCode,
      message: errorMessage,
      timestamp,
      path,
    });
  }
}
