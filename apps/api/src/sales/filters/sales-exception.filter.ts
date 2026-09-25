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
  PaymentOptimisticLockException,
  ReceiptOptimisticLockException,
  DuplicateReceiptException,
  InvalidSaleTransitionException,
  InvalidSaleStateException,
  SaleNotFoundException,
  PaymentNotFoundException,
  ReceiptNotFoundException,
  SaleNotPayableException,
  PaymentOverpaymentException,
  PaymentUnauthorizedException,
  ReceiptUnauthorizedException,
  PaymentCurrencyMismatchException,
  InvalidPaymentMethodException,
  InvalidPaymentReferenceException,
  InvalidPaymentStatusException,
  InvalidPaymentTransitionException,
  PaymentDomainException,
  ReceiptDomainException,
  ReceiptIssuanceRejectedException,
} from '@kinergy-platform/core';

/**
 * Enterprise Exception Filter translating Domain Sales, Payment & Monetary Invariant Exceptions
 * into standard HTTP response envelopes with RFC-compliant status codes.
 */
@Catch()
export class SalesExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    // 1. Optimistic Concurrency & Lock Collisions (409 Conflict)
    if (
      exception instanceof SaleOptimisticLockException ||
      exception instanceof PaymentOptimisticLockException ||
      exception instanceof ReceiptOptimisticLockException ||
      exception instanceof DuplicateReceiptException
    ) {
      const code =
        'code' in exception && typeof (exception as { code: unknown }).code === 'string'
          ? (exception as { code: string }).code
          : 'CONFLICT';

      response.status(HttpStatus.CONFLICT).json({
        statusCode: HttpStatus.CONFLICT,
        error: 'Conflict',
        code,
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

    // 2. Not Found Entities (404 Not Found)
    if (
      exception instanceof SaleNotFoundException ||
      exception instanceof PaymentNotFoundException ||
      exception instanceof ReceiptNotFoundException
    ) {
      response.status(HttpStatus.NOT_FOUND).json({
        statusCode: HttpStatus.NOT_FOUND,
        error: 'Not Found',
        message: exception.message,
      });
      return;
    }

    // 3. Security & Multi-Tenant Authorization (403 Forbidden)
    if (
      exception instanceof PaymentUnauthorizedException ||
      exception instanceof ReceiptUnauthorizedException
    ) {
      response.status(HttpStatus.FORBIDDEN).json({
        statusCode: HttpStatus.FORBIDDEN,
        error: 'Forbidden',
        message: exception.message,
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

      response.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'Unprocessable Entity',
        code,
        message: exception.message,
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
      exception instanceof SaleDomainException
    ) {
      const code =
        'code' in exception && typeof (exception as { code: unknown }).code === 'string'
          ? (exception as { code: string }).code
          : 'BAD_REQUEST';

      response.status(HttpStatus.BAD_REQUEST).json({
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'Bad Request',
        code,
        message: exception.message,
      });
      return;
    }

    // 6. Native NestJS HTTP Exceptions
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
