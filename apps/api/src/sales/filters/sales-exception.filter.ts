import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import {
  SaleDomainException,
  InvalidMoneyException,
  InvalidDiscountException,
  InvalidSaleItemException,
  EmptySaleException,
  SaleAlreadyFinalizedException,
  SaleOptimisticLockException,
  InvalidSaleTransitionException,
  InvalidSaleStateException,
} from '@kinergy-platform/core';

/**
 * Enterprise Exception Filter translating Domain Sales & Monetary Invariant Exceptions
 * into standard HTTP response envelopes with RFC-compliant status codes.
 */
@Catch()
export class SalesExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    if (exception instanceof SaleOptimisticLockException) {
      response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: exception.code,
        message: exception.message,
      });
      return;
    }

    if (exception instanceof SaleAlreadyFinalizedException) {
      response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code: exception.code,
        message: exception.message,
      });
      return;
    }

    if (exception instanceof EmptySaleException) {
      response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'Unprocessable Entity',
        code: exception.code,
        message: exception.message,
      });
      return;
    }

    if (exception instanceof InvalidSaleTransitionException) {
      response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'Unprocessable Entity',
        code: exception.code,
        message: exception.message,
      });
      return;
    }

    if (
      exception instanceof InvalidMoneyException ||
      exception instanceof InvalidDiscountException ||
      exception instanceof InvalidSaleItemException ||
      exception instanceof InvalidSaleStateException
    ) {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        code: exception.code,
        message: exception.message,
      });
      return;
    }

    if (exception instanceof SaleDomainException) {
      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        code: exception.code,
        message: exception.message,
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const resPayload = exception.getResponse();
      response
        .status(status)
        .json(
          typeof resPayload === 'object' ? resPayload : { statusCode: status, message: resPayload },
        );
      return;
    }

    // Pass through unhandled errors for global filters
    throw exception;
  }
}
