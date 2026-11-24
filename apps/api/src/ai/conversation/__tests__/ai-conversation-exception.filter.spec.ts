import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Response, Request } from 'express';
import { AiConversationExceptionFilter } from '../filters/ai-conversation-exception.filter';
import {
  ConversationNotFoundError,
  TurnNotFoundError,
  MessageNotFoundError,
  InvalidTurnInputError,
  DuplicateClientTurnPayloadMismatchError,
  TurnAlreadyInProgressError,
  TenantOwnershipViolationError,
  TransientTransactionFailureError,
  TransactionFailureError,
} from '@kinergy-platform/core';

describe('AI-09.3-BE.05.01 — AiConversationExceptionFilter Verification', () => {
  let filter: AiConversationExceptionFilter;
  let mockResponse: { status: jest.Mock; json: jest.Mock; setHeader: jest.Mock };
  let mockHost: ArgumentsHost;

  beforeEach(() => {
    filter = new AiConversationExceptionFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
    };
    mockHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse as unknown as Response,
        getRequest: () => ({ url: '/api/v1/ai/conversations/conv_123' }) as unknown as Request,
      }),
    } as unknown as ArgumentsHost;
  });

  it('1. maps ConversationNotFoundError to 404 NOT_FOUND with clean message and code', () => {
    const error = new ConversationNotFoundError('conv_123', 'tenant_abc');

    filter.catch(error, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        error: 'Not Found',
        code: 'AI_CONVERSATION_NOT_FOUND',
        message: expect.stringContaining("Conversation 'conv_123' not found"),
        path: '/api/v1/ai/conversations/conv_123',
      }),
    );
  });

  it('1b. maps TurnNotFoundError and MessageNotFoundError to 404 NOT_FOUND', () => {
    const turnError = new TurnNotFoundError('turn_123');
    filter.catch(turnError, mockHost);
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        error: 'Not Found',
        code: 'AI_TURN_NOT_FOUND',
      }),
    );

    const msgError = new MessageNotFoundError('msg_123');
    filter.catch(msgError, mockHost);
    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        error: 'Not Found',
        code: 'AI_MESSAGE_NOT_FOUND',
      }),
    );
  });

  it('2. maps InvalidTurnInputError to 400 BAD_REQUEST', () => {
    const error = new InvalidTurnInputError('userPrompt', 'Prompt cannot be empty');

    filter.catch(error, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 400,
        error: 'Bad Request',
        code: 'AI_INVALID_TURN_INPUT',
      }),
    );
  });

  it('3. maps DuplicateClientTurnPayloadMismatchError to 409 CONFLICT', () => {
    const error = new DuplicateClientTurnPayloadMismatchError('client_1', 'hash_a', 'hash_b');

    filter.catch(error, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        error: 'Conflict',
        code: 'AI_CLIENT_TURN_PAYLOAD_MISMATCH',
      }),
    );
  });

  it('4. maps TurnAlreadyInProgressError to 409 CONFLICT and sets Retry-After header', () => {
    const error = new TurnAlreadyInProgressError('conv_123', 'turn_active_1');

    filter.catch(error, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(mockResponse.setHeader).toHaveBeenCalledWith('Retry-After', '2');
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 409,
        error: 'Conflict',
        code: 'AI_TURN_ALREADY_IN_PROGRESS',
      }),
    );
  });

  it('5. maps TenantOwnershipViolationError to 403 FORBIDDEN', () => {
    const error = new TenantOwnershipViolationError('AiConversation', 'conv_123', 'tenant_other');

    filter.catch(error, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 403,
        error: 'Forbidden',
        code: 'AI_TENANT_OWNERSHIP_VIOLATION',
      }),
    );
  });

  it('6. maps TransientTransactionFailureError to 503 SERVICE_UNAVAILABLE', () => {
    const error = new TransientTransactionFailureError('TestRunner', new Error('deadlock'), 3);

    filter.catch(error, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 503,
        error: 'Service Unavailable',
        code: 'AI_TRANSIENT_TRANSACTION_FAILURE',
        message: expect.stringContaining('Database transaction failed due to concurrent conflicts'),
      }),
    );
  });

  it('7. maps generic TransactionFailureError to 500 INTERNAL_SERVER_ERROR without exposing root stack', () => {
    const internalErr = new Error('FATAL: disk corrupt / internal sql error');
    const error = new TransactionFailureError('TestRunner', internalErr);

    filter.catch(error, mockHost);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    const jsonArg = mockResponse.json.mock.calls[0][0];

    expect(jsonArg.statusCode).toBe(500);
    expect(jsonArg.error).toBe('Internal Server Error');
    // Ensure raw stack / SQL message is NOT leaked to caller
    expect(jsonArg.message).not.toContain('FATAL');
    expect(jsonArg.stack).toBeUndefined();
  });
});
