import {
  ArgumentsHost,
  HttpStatus,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Response, Request } from 'express';
import {
  InvalidMoneyException,
  InvalidDiscountException,
  EmptySaleException,
  SaleOptimisticLockException,
  PaymentOptimisticLockException,
  ReceiptOptimisticLockException,
  DuplicateReceiptException,
  SaleNotFoundException,
  PaymentNotFoundException,
  SaleNotPayableException,
  PaymentOverpaymentException,
  PaymentUnauthorizedException,
  ReceiptUnauthorizedException,
  SaleUnauthorizedException,
  InvalidPaymentMethodException,
  ReceiptIssuanceRejectedException,
  InvalidSaleTransitionException,
} from '@kinergy-platform/core';
import { SalesExceptionFilter } from '../filters/sales-exception.filter';
import { GlobalExceptionFilter } from '../../common/filters/global-exception.filter';

describe('API Security — Error Handling Standardization Specification (Phase 7)', () => {
  let salesFilter: SalesExceptionFilter;
  let globalFilter: GlobalExceptionFilter;

  let mockResponse: {
    status: jest.Mock;
    json: jest.Mock;
    setHeader: jest.Mock;
  };

  let mockRequest: {
    url: string;
    method: string;
    headers: Record<string, string>;
  };

  let mockHost: ArgumentsHost;

  beforeEach(() => {
    salesFilter = new SalesExceptionFilter();
    globalFilter = new GlobalExceptionFilter();

    mockRequest = {
      url: '/api/v1/sales/sale_01j987654321/payments',
      method: 'POST',
      headers: {
        'x-correlation-id': 'corr_test_abc123',
      },
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
    };

    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse as unknown as Response,
        getRequest: () => mockRequest as unknown as Request,
        getNext: () => jest.fn(),
      }),
      getArgs: () => [],
      getArgByIndex: () => undefined,
      switchToRpc: () => ({ getData: () => undefined, getContext: () => undefined }),
      switchToWs: () => ({ getData: () => undefined, getClient: () => undefined }),
      getType: () => 'http',
    } as unknown as ArgumentsHost;
  });

  // 1. Unauthenticated request
  describe('1. Unauthenticated Requests Contract (HTTP 401 Unauthorized)', () => {
    it('returns standardized 401 Unauthorized for missing authentication token via SalesExceptionFilter', () => {
      const ex = new UnauthorizedException('Authentication token required.');
      salesFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('x-correlation-id', 'corr_test_abc123');
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNAUTHORIZED,
          error: 'Unauthorized',
          message: 'Authentication token required.',
        }),
      );
    });

    it('returns standardized 401 Unauthorized for expired authentication token via SalesExceptionFilter', () => {
      const ex = new UnauthorizedException('Invalid or expired authentication token.');
      salesFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNAUTHORIZED,
          error: 'Unauthorized',
          message: 'Invalid or expired authentication token.',
        }),
      );
    });

    it('returns standardized 401 Unauthorized via GlobalExceptionFilter preserving top-level contract', () => {
      const ex = new UnauthorizedException('Authentication token required.');
      globalFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('x-correlation-id', 'corr_test_abc123');
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNAUTHORIZED,
          timestamp: expect.any(String),
          path: mockRequest.url,
          error: expect.objectContaining({
            statusCode: HttpStatus.UNAUTHORIZED,
            error: 'Unauthorized',
            message: 'Authentication token required.',
          }),
        }),
      );
    });
  });

  // 2. Authenticated but unauthorized request
  describe('2. Authenticated But Unauthorized Requests (HTTP 403 Forbidden)', () => {
    it('returns standardized 403 Forbidden when AuthorizationGuard rejects insufficient permissions', () => {
      const ex = new ForbiddenException('Access denied: required permission missing.');
      salesFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.FORBIDDEN,
          error: 'Forbidden',
          message: 'Access denied: required permission missing.',
        }),
      );
    });

    it('translates SaleUnauthorizedException to 403 Forbidden without leaking internal evaluator details', () => {
      const ex = new SaleUnauthorizedException(
        'User does not possess required permissions (sales.create) to perform this sale action.',
      );
      salesFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.FORBIDDEN,
          error: 'Forbidden',
          message: expect.stringContaining('User does not possess required permissions'),
        }),
      );
    });

    it('translates PaymentUnauthorizedException to 403 Forbidden', () => {
      const ex = new PaymentUnauthorizedException('Cross-tenant access forbidden');
      salesFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.FORBIDDEN,
          error: 'Forbidden',
          message: 'Cross-tenant access forbidden',
        }),
      );
    });

    it('translates ReceiptUnauthorizedException to 403 Forbidden', () => {
      const ex = new ReceiptUnauthorizedException(
        'Access denied: user is not authorized to access this receipt document.',
      );
      salesFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.FORBIDDEN,
          error: 'Forbidden',
          message: 'Access denied: user is not authorized to access this receipt document.',
        }),
      );
    });
  });

  // 3. Authorized request that fails domain validation
  describe('3. Authorized Requests Failing Domain & Lifecycle Invariants (400, 422, 409, 404)', () => {
    it('translates domain validation error (InvalidMoneyException) to 400 Bad Request', () => {
      const ex = new InvalidMoneyException('Amount cannot be negative.');
      salesFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          code: 'INVALID_MONEY',
          message: 'Amount cannot be negative.',
        }),
      );
    });

    it('translates domain validation error (InvalidDiscountException) to 400 Bad Request', () => {
      const ex = new InvalidDiscountException('Discount percentage cannot exceed 100%.');
      salesFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          message: 'Discount percentage cannot exceed 100%.',
        }),
      );
    });

    it('translates invalid tender method (InvalidPaymentMethodException) to 400 Bad Request', () => {
      const ex = new InvalidPaymentMethodException('CRYPTO');
      salesFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          error: 'Bad Request',
          code: 'INVALID_PAYMENT_METHOD',
        }),
      );
    });

    it('translates lifecycle invariant failure (EmptySaleException) to 422 Unprocessable Entity', () => {
      const ex = new EmptySaleException('sale_empty_123');
      salesFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'Unprocessable Entity',
          code: 'EMPTY_SALE',
        }),
      );
    });

    it('translates invalid state transition (InvalidSaleTransitionException) to 422 Unprocessable Entity', () => {
      const ex = new InvalidSaleTransitionException(
        'DRAFT',
        'PAID',
        'Cannot pay draft sale directly.',
      );
      salesFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'Unprocessable Entity',
          code: 'INVALID_SALE_TRANSITION',
        }),
      );
    });

    it('translates underpayment / overpayment (PaymentOverpaymentException) to 422 Unprocessable Entity', () => {
      const ex = new PaymentOverpaymentException('150.00', '100.00', 'USD');
      salesFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'Unprocessable Entity',
          code: 'PAYMENT_OVERPAYMENT',
        }),
      );
    });

    it('translates receipt issuance rejection (ReceiptIssuanceRejectedException) to 422 Unprocessable Entity', () => {
      const ex = new ReceiptIssuanceRejectedException('Sale has not been fully settled.');
      salesFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'Unprocessable Entity',
          code: 'UNPROCESSABLE_ENTITY',
        }),
      );
    });

    it('translates concurrency conflict (SaleOptimisticLockException) to 409 Conflict', () => {
      const ex = new SaleOptimisticLockException('Sale', 'sale_123', 2);
      salesFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          code: 'OPTIMISTIC_LOCK_ERROR',
        }),
      );
    });

    it('translates payment optimistic lock (PaymentOptimisticLockException) to 409 Conflict', () => {
      const ex = new PaymentOptimisticLockException('pay_123', 2);
      salesFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          code: 'OPTIMISTIC_LOCK_ERROR',
        }),
      );
    });

    it('translates receipt optimistic lock (ReceiptOptimisticLockException) to 409 Conflict', () => {
      const ex = new ReceiptOptimisticLockException('rec_123', 2);
      salesFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          code: 'OPTIMISTIC_LOCK_ERROR',
        }),
      );
    });

    it('translates duplicate receipt race (DuplicateReceiptException) to 409 Conflict', () => {
      const ex = new DuplicateReceiptException('sale_123', 'REC-2026-000001');
      salesFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.CONFLICT,
          error: 'Conflict',
          code: 'DUPLICATE_RECEIPT',
        }),
      );
    });

    it('preserves uniform 404 Not Found behavior for protected resource cross-tenant / missing lookups', () => {
      const ex = new SaleNotFoundException('sale_cross_tenant_probe');
      salesFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.NOT_FOUND,
          error: 'Not Found',
          message: expect.stringContaining('sale_cross_tenant_probe'),
        }),
      );
    });

    it('preserves uniform 404 Not Found behavior for payment lookup', () => {
      const ex = new PaymentNotFoundException('pay_cross_tenant_probe');
      salesFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.NOT_FOUND,
          error: 'Not Found',
          message: expect.stringContaining('pay_cross_tenant_probe'),
        }),
      );
    });
  });

  // 4. Authorized request encountering unexpected infrastructure failure
  describe('4. Unexpected Infrastructure Failures (HTTP 500 Internal Server Error)', () => {
    it('sanitizes unexpected Prisma exception and produces clean 500 without leaking SQL or Prisma schema details', () => {
      const prismaError = new Error(
        'PrismaClientKnownRequestError: Invalid `prisma.receipt.findUnique()` invocation. Table "receipts" does not exist in schema.',
      );
      prismaError.name = 'PrismaClientKnownRequestError';
      (prismaError as unknown as { code: string }).code = 'P2021';

      salesFilter.catch(prismaError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
        message: 'An unexpected internal server error occurred.',
      });
    });

    it('sanitizes unexpected Database connection failure with credentials without leaking connection string', () => {
      const dbError = new Error(
        'connect ECONNREFUSED postgres://postgres:SuperSecretPassword123@db.prod.kinergy.internal:5432/kinergy_db',
      );
      salesFilter.catch(dbError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.json).toHaveBeenCalledWith({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
        message: 'An unexpected internal server error occurred.',
      });
    });

    it('sanitizes generic unhandled Error and does NOT expose internal stack traces', () => {
      const unexpectedError = new TypeError(
        'Cannot read property "undefined_record" of null at PrismaSalesUnitOfWork.execute',
      );
      salesFilter.catch(unexpectedError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      const resPayload = mockResponse.json.mock.calls[0][0];
      expect(resPayload).toEqual({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        error: 'Internal Server Error',
        message: 'An unexpected internal server error occurred.',
      });
      expect(resPayload.stack).toBeUndefined();
      expect(JSON.stringify(resPayload)).not.toContain('PrismaSalesUnitOfWork');
    });

    it('sanitizes 500 HttpException with technical message passed via framework', () => {
      const technical500 = new InternalServerErrorException(
        'Raw SQL syntax error: SELECT * FROM payment_methods WHERE 1=1',
      );
      salesFilter.catch(technical500, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      const resPayload = mockResponse.json.mock.calls[0][0];
      expect(resPayload.message).toBe('An unexpected internal server error occurred.');
      expect(JSON.stringify(resPayload)).not.toContain('Raw SQL syntax error');
    });

    it('sanitizes 500 in GlobalExceptionFilter without leaking technical details', () => {
      const technical500 = new InternalServerErrorException(
        'Database deadlocked during concurrent update',
      );
      globalFilter.catch(technical500, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      const resPayload = mockResponse.json.mock.calls[0][0];
      expect(resPayload.error.message).toBe('Internal server error');
      expect(JSON.stringify(resPayload)).not.toContain('Database deadlocked');
    });
  });

  // 5. Sensitive information is absent from error responses
  describe('5. Sensitive Information Absence & Redaction Verification', () => {
    it('masks credit card PAN sequences (13-19 digits) if incidentally passed into exception messages', () => {
      const ex = new BadRequestException(
        'Invalid reference containing card 4532015987654321 in tender metadata',
      );
      salesFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
      const resPayload = mockResponse.json.mock.calls[0][0];
      expect(JSON.stringify(resPayload)).toContain('****-****-****-[MASKED]');
      expect(JSON.stringify(resPayload)).not.toContain('4532015987654321');
    });

    it('redacts Bearer tokens or JWT credentials if present in exception messages', () => {
      const ex = new UnauthorizedException(
        'Authentication rejected for token: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.token_body.signature',
      );
      salesFilter.catch(ex, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
      const resPayload = mockResponse.json.mock.calls[0][0];
      expect(JSON.stringify(resPayload)).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(JSON.stringify(resPayload)).toContain('[REDACTED');
    });

    it('guarantees stack traces are never exposed in any client response payload', () => {
      const errorWithStack = new Error('Severe domain exception with active stack trace');
      salesFilter.catch(errorWithStack, mockHost);

      const resPayload = mockResponse.json.mock.calls[0][0];
      expect(resPayload.stack).toBeUndefined();
      expect(resPayload.trace).toBeUndefined();
      expect(resPayload.error).toBe('Internal Server Error');
    });
  });

  // 6. Existing API error contracts remain compatible
  describe('6. Existing API Error Contracts Compatibility', () => {
    it('propagates x-correlation-id response header when present in incoming request', () => {
      mockRequest.headers['x-correlation-id'] = 'corr_flow_987654';
      const ex = new SaleNotFoundException('sale_not_found_1');

      salesFilter.catch(ex, mockHost);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('x-correlation-id', 'corr_flow_987654');
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    });

    it('supports x-request-id alternative header for correlation tracing', () => {
      delete mockRequest.headers['x-correlation-id'];
      mockRequest.headers['x-request-id'] = 'req_flow_112233';
      const ex = new SaleNotPayableException('sale_1', 'CANCELLED');

      salesFilter.catch(ex, mockHost);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('x-correlation-id', 'req_flow_112233');
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
    });

    it('gracefully handles missing correlation headers without crashing', () => {
      mockRequest.headers = {};
      const ex = new InvalidMoneyException('Zero is not allowed.');

      expect(() => salesFilter.catch(ex, mockHost)).not.toThrow();
      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    });
  });
});
