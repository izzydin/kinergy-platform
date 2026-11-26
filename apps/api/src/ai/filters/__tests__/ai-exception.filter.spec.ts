import {
  BadRequestException,
  ForbiddenException,
  GatewayTimeoutException,
  HttpStatus,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
  ArgumentsHost,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { AiExceptionFilter } from '../ai-exception.filter';
import {
  TurnAlreadyInProgressError,
  LLMProviderUnavailableException,
  TenantOwnershipViolationError,
  ConversationNotFoundError,
} from '@kinergy-platform/core';

describe('AI-09.8-ER.02 — AiExceptionFilter Unified Error Handling', () => {
  let filter: AiExceptionFilter;
  let mockResponse: {
    status: jest.Mock;
    json: jest.Mock;
    setHeader: jest.Mock;
  };
  let mockRequest: {
    url: string;
    headers: Record<string, string>;
  };
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new AiExceptionFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
    };
    mockRequest = {
      url: '/api/v1/ai/rag/query',
      headers: {},
    };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse as unknown as Response,
        getRequest: () => mockRequest as unknown as Request,
      }),
    } as unknown as ArgumentsHost;
  });

  describe('Standardized Error Response Structure', () => {
    it('formats response with all standard fields according to AiErrorResponseDto', () => {
      const error = new NotFoundException('Requested knowledge source not found');

      filter.catch(error, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          error: 'Not Found',
          code: 'RESOURCE_NOT_FOUND',
          message: 'Requested knowledge source not found',
          path: '/api/v1/ai/rag/query',
          timestamp: expect.any(String),
          correlationId: expect.any(String),
          retryable: false,
        }),
      );
    });

    it('propagates incoming x-correlation-id header to response headers and body', () => {
      mockRequest.headers['x-correlation-id'] = 'corr-uuid-12345';

      const error = new BadRequestException('Validation failed on query payload');
      filter.catch(error, mockHost);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('x-correlation-id', 'corr-uuid-12345');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('x-request-id', 'corr-uuid-12345');
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          correlationId: 'corr-uuid-12345',
          code: 'VALIDATION_ERROR',
        }),
      );
    });

    it('generates a new correlationId if neither x-correlation-id nor x-request-id is provided', () => {
      const error = new UnauthorizedException('Authentication credentials missing');
      filter.catch(error, mockHost);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('x-correlation-id', expect.any(String));
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 401,
          code: 'UNAUTHENTICATED',
          correlationId: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          ),
        }),
      );
    });

    it('maps HTTP ForbiddenException to 403 FORBIDDEN with non-retryable flag', () => {
      const error = new ForbiddenException('Insufficient administrative privileges');
      filter.catch(error, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          code: 'FORBIDDEN',
          message: 'Insufficient administrative privileges',
          retryable: false,
        }),
      );
    });
  });

  describe('Domain & Use-Case Error Mapping', () => {
    it('maps TurnAlreadyInProgressError to 409 CONFLICT with Retry-After header and retryable=true', () => {
      const error = new TurnAlreadyInProgressError('conv_999', 'turn_active');

      filter.catch(error, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Retry-After', '2');
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 409,
          error: 'Conflict',
          code: 'AI_TURN_ALREADY_IN_PROGRESS',
          retryable: true,
          retryAfterSeconds: 2,
        }),
      );
    });

    it('maps TenantOwnershipViolationError to 403 FORBIDDEN with non-retryable flag', () => {
      const error = new TenantOwnershipViolationError('conv_abc', 'tenant_1', 'tenant_2');

      filter.catch(error, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          code: 'AI_TENANT_OWNERSHIP_VIOLATION',
          retryable: false,
        }),
      );
    });

    it('maps ConversationNotFoundError to 404 RESOURCE_NOT_FOUND', () => {
      const error = new ConversationNotFoundError('conv_404', 'tenant_1');

      filter.catch(error, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 404,
          code: 'AI_CONVERSATION_NOT_FOUND',
          retryable: false,
        }),
      );
    });
  });

  describe('Provider & Upstream Failure Mapping', () => {
    it('maps LLMProviderUnavailableException to 503 PROVIDER_UNAVAILABLE with Retry-After header', () => {
      const error = new LLMProviderUnavailableException('Google Gemini 1.5 Pro unavailable');

      filter.catch(error, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Retry-After', '2');
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 503,
          error: 'Service Unavailable',
          code: 'LLM_PROVIDER_UNAVAILABLE',
          retryable: true,
          retryAfterSeconds: 2,
        }),
      );
    });

    it('maps GatewayTimeoutException to 504 PROVIDER_TIMEOUT with retryable=true', () => {
      const error = new GatewayTimeoutException('Upstream provider timed out after 30000ms');

      filter.catch(error, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.GATEWAY_TIMEOUT);
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Retry-After', '3');
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 504,
          code: 'PROVIDER_TIMEOUT',
          retryable: true,
          retryAfterSeconds: 3,
        }),
      );
    });

    it('maps ServiceUnavailableException to 503 PROVIDER_UNAVAILABLE with retryable=true', () => {
      const error = new ServiceUnavailableException('Embedding service capacity reached');

      filter.catch(error, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 503,
          code: 'PROVIDER_UNAVAILABLE',
          retryable: true,
        }),
      );
    });
  });

  describe('Security Sanitization of Sensitive Messages', () => {
    it('redacts internal database queries from unexpected runtime errors', () => {
      const sensitiveError = new Error(
        'SELECT * FROM "tenant_secrets" WHERE id = \'xyz\' failed: syntax error',
      );

      filter.catch(sensitiveError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          error: 'Internal Server Error',
          code: 'AI_INTERNAL_ERROR',
          message: 'An unexpected error occurred during AI processing.',
          retryable: false,
        }),
      );
      // Ensure no leak
      const jsonResponse = mockResponse.json.mock.calls[0][0];
      expect(jsonResponse.message).not.toContain('tenant_secrets');
      expect(jsonResponse.message).not.toContain('SELECT');
    });

    it('sanitizes stack traces and file paths from error outputs', () => {
      const pathError = new Error(
        "ENOENT: no such file or directory, open 'C:\\Projects\\kinergy\\config.env'",
      );

      filter.catch(pathError, mockHost);

      expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 500,
          code: 'AI_INTERNAL_ERROR',
          message: 'An unexpected error occurred during AI processing.',
        }),
      );
      const jsonResponse = mockResponse.json.mock.calls[0][0];
      expect(jsonResponse.message).not.toContain('C:\\Projects');
    });
  });
});
