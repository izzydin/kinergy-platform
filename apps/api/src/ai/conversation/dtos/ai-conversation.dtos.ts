import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ConversationListCursor,
  ConversationRole,
  GenerationStatus,
  MessageHistoryCursor,
  TurnStatus,
} from '@kinergy-platform/core';

// ==========================================
// Custom Validation Decorators
// ==========================================

/**
 * Validates that a string is not empty and contains at least one non-whitespace character.
 * Prevents silent bypass via empty spaces while preserving valid inputs.
 */
export function IsNotBlank(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNotBlank',
      target: object.constructor,
      propertyName: propertyName,
      options: {
        message: `${propertyName} must not be empty or contain only whitespace`,
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          return typeof value === 'string' && value.trim().length > 0;
        },
      },
    });
  };
}

/**
 * Validates that an optional string cursor conforms to the URL-safe base64 conversation list cursor contract.
 */
export function IsValidConversationListCursor(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidConversationListCursor',
      target: object.constructor,
      propertyName: propertyName,
      options: {
        message:
          'Invalid conversation list cursor: must be a valid base64url encoded cursor containing lastActivityAt and conversation id',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null) return true;
          if (typeof value !== 'string' || value.trim().length === 0) return false;
          try {
            ConversationListCursor.decode(value);
            return true;
          } catch {
            return false;
          }
        },
      },
    });
  };
}

/**
 * Validates that an optional string cursor conforms to the immutable sequence-based message history cursor contract.
 * Rejects activity-timestamp cursors or malformed structures.
 */
export function IsValidMessageHistoryCursor(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidMessageHistoryCursor',
      target: object.constructor,
      propertyName: propertyName,
      options: {
        message:
          'Invalid message history cursor: must be an immutable sequence-based cursor containing positive sequenceNumber and messageId',
        ...validationOptions,
      },
      validator: {
        validate(value: unknown) {
          if (value === undefined || value === null) return true;
          if (typeof value !== 'string' || value.trim().length === 0) return false;
          try {
            MessageHistoryCursor.decode(value);
            return true;
          } catch {
            return false;
          }
        },
      },
    });
  };
}

// ==========================================
// 1. Request DTOs
// ==========================================

export class CreateConversationRequestDto {
  @ApiProperty({
    description:
      'Unique client-generated turn idempotency identifier (UUID or stable client key, max 64 characters)',
    example: 'turn_client_98a76b5c',
    maxLength: 64,
  })
  @IsString({ message: 'clientTurnId must be a string' })
  @IsNotBlank({ message: 'clientTurnId must not be empty or contain only whitespace' })
  @MaxLength(64, { message: 'clientTurnId must not exceed 64 characters' })
  clientTurnId!: string;

  @ApiProperty({
    description: 'Initial prompt or inquiry submitted by the user (1 to 4000 characters)',
    example: 'What are the physiological markers of VO2 max improvement?',
    maxLength: 4000,
  })
  @IsString({ message: 'userPrompt must be a string' })
  @IsNotBlank({ message: 'userPrompt must not be empty or contain only whitespace' })
  @MaxLength(4000, { message: 'userPrompt must not exceed 4000 characters' })
  userPrompt!: string;

  @ApiPropertyOptional({
    description:
      'Optional initial title for the conversation (1 to 255 characters). If omitted, derived from user prompt.',
    example: 'VO2 Max Physiological Analysis',
    maxLength: 255,
  })
  @IsOptional()
  @IsString({ message: 'title must be a string' })
  @IsNotBlank({ message: 'title must not be empty or contain only whitespace' })
  @MaxLength(255, { message: 'title must not exceed 255 characters' })
  title?: string;

  @ApiPropertyOptional({
    description: 'Optional client metadata associated with the conversation',
    type: Object,
    example: { source: 'clinical_portal', protocolVersion: '2.1' },
  })
  @IsOptional()
  @IsObject({ message: 'metadata must be a JSON object' })
  metadata?: Record<string, unknown>;
}

export class ReserveTurnRequestDto {
  @ApiProperty({
    description:
      'Unique client-generated turn idempotency identifier (UUID or stable client key, max 64 characters)',
    example: 'turn_client_f43e21a0',
    maxLength: 64,
  })
  @IsString({ message: 'clientTurnId must be a string' })
  @IsNotBlank({ message: 'clientTurnId must not be empty or contain only whitespace' })
  @MaxLength(64, { message: 'clientTurnId must not exceed 64 characters' })
  clientTurnId!: string;

  @ApiProperty({
    description: 'Subsequent user prompt for this conversation turn (1 to 4000 characters)',
    example: 'How does interval training impact lactate threshold velocity?',
    maxLength: 4000,
  })
  @IsString({ message: 'userPrompt must be a string' })
  @IsNotBlank({ message: 'userPrompt must not be empty or contain only whitespace' })
  @MaxLength(4000, { message: 'userPrompt must not exceed 4000 characters' })
  userPrompt!: string;

  @ApiPropertyOptional({
    description: 'Optional turn-level metadata',
    type: Object,
    example: { telemetrySource: 'mobile_app' },
  })
  @IsOptional()
  @IsObject({ message: 'metadata must be a JSON object' })
  metadata?: Record<string, unknown>;
}

export class UpdateConversationTitleRequestDto {
  @ApiProperty({
    description: 'New title for the active conversation (1 to 255 characters)',
    example: 'Metabolic & Cardiovascular Protocol',
    maxLength: 255,
  })
  @IsString({ message: 'title must be a string' })
  @IsNotBlank({ message: 'title must not be empty or contain only whitespace' })
  @MaxLength(255, { message: 'title must not exceed 255 characters' })
  title!: string;
}

export class ListConversationsQueryDto {
  @ApiPropertyOptional({
    description: 'Opaque keyset cursor for retrieving subsequent conversation pages',
    example: 'eyJ2IjoxLCJzIjoyLCJpZCI6ImNvbnZfMTIzIn0',
  })
  @IsOptional()
  @IsString({ message: 'cursor must be a string' })
  @IsValidConversationListCursor()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Page size limit (min 1, max 100, default 20)',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(100, { message: 'limit must not exceed 100' })
  limit?: number;

  @ApiPropertyOptional({
    description: 'Whether to include soft-deleted / archived conversations in results',
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'includeArchived must be a boolean' })
  includeArchived?: boolean;
}

export class GetMessageHistoryQueryDto {
  @ApiPropertyOptional({
    description: 'Immutable sequence-based keyset cursor for message history pagination',
    example: 'eyJzIjoyLCJpZCI6Im1zZ18xMjMifQ',
  })
  @IsOptional()
  @IsString({ message: 'cursor must be a string' })
  @IsValidMessageHistoryCursor()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Page size limit for message history (min 1, max 100, default 20)',
    minimum: 1,
    maximum: 100,
    default: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be an integer' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(100, { message: 'limit must not exceed 100' })
  limit?: number;
}

// ==========================================
// 2. Response DTOs
// ==========================================

export class ConversationSummaryResponseDto {
  @ApiProperty({ description: 'Conversation unique identifier', example: 'conv_12345' })
  id!: string;

  @ApiProperty({ description: 'Conversation title', example: 'VO2 Max Analysis' })
  title!: string;

  @ApiProperty({ description: 'Total number of turns in conversation', example: 3 })
  turnCounter!: number;

  @ApiProperty({ description: 'ISO 8601 timestamp of most recent activity' })
  lastActivityAt!: string;

  @ApiProperty({ description: 'ISO 8601 creation timestamp' })
  createdAt!: string;

  @ApiProperty({
    description: 'Whether the conversation is archived / soft-deleted',
    example: false,
  })
  isArchived!: boolean;
}

export class ListConversationsResponseDto {
  @ApiProperty({
    description: 'Array of conversation summaries in the current page',
    type: [ConversationSummaryResponseDto],
  })
  items!: ConversationSummaryResponseDto[];

  @ApiPropertyOptional({
    description: 'Opaque keyset cursor for the next page, or null if no further pages',
    nullable: true,
  })
  nextCursor!: string | null;

  @ApiProperty({ description: 'Whether additional pages are available', example: true })
  hasMore!: boolean;
}

export class TurnSummaryResponseDto {
  @ApiProperty({ description: 'Turn unique identifier', example: 'turn_123' })
  id!: string;

  @ApiProperty({ description: 'Sequential 1-based turn index', example: 1 })
  turnIndex!: number;

  @ApiProperty({
    description: 'Turn lifecycle status',
    enum: TurnStatus,
    example: TurnStatus.COMPLETED,
  })
  status!: TurnStatus;

  @ApiProperty({ description: 'Client idempotency key for this turn', example: 'client_turn_abc' })
  clientTurnId!: string;

  @ApiPropertyOptional({
    description: 'Active assistant attempt ID for in-progress generations',
    nullable: true,
  })
  activeAttemptId!: string | null;

  @ApiProperty({ description: 'Active attempt number (1-based)', example: 1 })
  activeAttemptNumber!: number;

  @ApiProperty({ description: 'ISO 8601 creation timestamp' })
  createdAt!: string;

  @ApiPropertyOptional({ description: 'ISO 8601 completion timestamp', nullable: true })
  completedAt!: string | null;
}

export class ConversationDetailResponseDto {
  @ApiProperty({ description: 'Conversation identifier', example: 'conv_123' })
  id!: string;

  @ApiProperty({ description: 'Conversation title', example: 'VO2 Max Analysis' })
  title!: string;

  @ApiProperty({ description: 'Turn count', example: 2 })
  turnCounter!: number;

  @ApiProperty({ description: 'Total message count', example: 4 })
  messageCounter!: number;

  @ApiProperty({ description: 'ISO 8601 timestamp of last activity' })
  lastActivityAt!: string;

  @ApiProperty({ description: 'ISO 8601 creation timestamp' })
  createdAt!: string;

  @ApiProperty({ description: 'ISO 8601 update timestamp' })
  updatedAt!: string;

  @ApiProperty({ description: 'Archived status', example: false })
  isArchived!: boolean;

  @ApiPropertyOptional({
    description: 'Optional list of turn summaries',
    type: [TurnSummaryResponseDto],
  })
  turns?: TurnSummaryResponseDto[];

  @ApiPropertyOptional({
    description: 'ID of active in-progress turn if one exists',
    nullable: true,
  })
  activeTurnId?: string | null;
}

export class MessageResponseDto {
  @ApiProperty({ description: 'Message identifier', example: 'msg_123' })
  id!: string;

  @ApiProperty({ description: 'Associated turn identifier', example: 'turn_456' })
  turnId!: string;

  @ApiProperty({
    description: 'Role of the author',
    enum: ConversationRole,
    example: ConversationRole.USER,
  })
  role!: ConversationRole;

  @ApiProperty({ description: 'Sequential message order in conversation', example: 1 })
  sequenceNumber!: number;

  @ApiProperty({ description: 'Generation attempt number for assistant answers', example: 1 })
  attemptNumber!: number;

  @ApiProperty({
    description: 'Whether this message is the canonical accepted answer',
    example: true,
  })
  isCanonical!: boolean;

  @ApiProperty({
    description: 'Generation status',
    enum: GenerationStatus,
    example: GenerationStatus.SUCCESS,
  })
  status!: GenerationStatus;

  @ApiProperty({ description: 'Content of the message' })
  content!: string;

  @ApiPropertyOptional({
    description: 'Retrieved citations or sources for assistant responses',
    nullable: true,
  })
  sources?: readonly Record<string, unknown>[] | null;

  @ApiProperty({ description: 'ISO 8601 creation timestamp' })
  createdAt!: string;

  @ApiPropertyOptional({ description: 'ISO 8601 completion timestamp', nullable: true })
  completedAt!: string | null;
}

export class MessageHistoryResponseDto {
  @ApiProperty({
    description: 'Canonical messages ordered by sequenceNumber ASC',
    type: [MessageResponseDto],
  })
  messages!: MessageResponseDto[];

  @ApiPropertyOptional({
    description: 'Keyset cursor for subsequent history pagination',
    nullable: true,
  })
  nextCursor!: string | null;

  @ApiProperty({ description: 'Whether further history pages exist', example: false })
  hasMore!: boolean;
}

export class CreateConversationResponseDto {
  @ApiProperty({ description: 'Unique conversation identifier', example: 'conv_12345' })
  conversationId!: string;

  @ApiProperty({ description: 'Unique turn identifier', example: 'turn_12345' })
  turnId!: string;

  @ApiProperty({
    description: 'Client-stable idempotency turn identifier',
    example: 'turn_client_98a76b5c',
  })
  clientTurnId!: string;

  @ApiProperty({ description: 'Turn sequence number (1 for initial turn)', example: 1 })
  turnIndex!: number;

  @ApiProperty({ description: 'User message identifier', example: 'msg_user_123' })
  userMessageId!: string;

  @ApiProperty({
    description: 'Assistant placeholder message identifier',
    example: 'msg_assistant_123',
  })
  assistantAttemptId!: string;

  @ApiProperty({ description: 'Conversation title', example: 'VO2 Max Analysis' })
  title!: string;

  @ApiProperty({
    description: 'Turn lifecycle status',
    enum: TurnStatus,
    example: TurnStatus.PENDING,
  })
  turnStatus!: TurnStatus;

  @ApiProperty({
    description: 'Whether this response is an idempotent replay of an existing turn',
    example: false,
  })
  isIdempotentReplay!: boolean;

  @ApiProperty({
    description: 'Idempotency outcome',
    enum: ['CREATED', 'EXISTING_RECOVERED'],
    example: 'CREATED',
  })
  idempotencyOutcome!: 'CREATED' | 'EXISTING_RECOVERED';

  @ApiProperty({ description: 'ISO 8601 creation timestamp' })
  createdAt!: string;
}

export class ReserveTurnResponseDto {
  @ApiProperty({ description: 'Unique conversation identifier', example: 'conv_12345' })
  conversationId!: string;

  @ApiProperty({ description: 'Unique turn identifier', example: 'turn_67890' })
  turnId!: string;

  @ApiProperty({
    description: 'Client-stable idempotency turn identifier',
    example: 'turn_client_f43e21a0',
  })
  clientTurnId!: string;

  @ApiProperty({ description: 'Turn sequence number in conversation', example: 2 })
  turnIndex!: number;

  @ApiProperty({ description: 'User message identifier', example: 'msg_user_456' })
  userMessageId!: string;

  @ApiProperty({
    description: 'Assistant placeholder message identifier',
    example: 'msg_assistant_456',
  })
  assistantAttemptId!: string;

  @ApiProperty({
    description: 'Turn lifecycle status',
    enum: TurnStatus,
    example: TurnStatus.PENDING,
  })
  turnStatus!: TurnStatus;

  @ApiProperty({
    description: 'Whether this response is an idempotent replay of an existing turn',
    example: false,
  })
  isIdempotentReplay!: boolean;

  @ApiProperty({
    description: 'Idempotency outcome',
    enum: ['CREATED', 'EXISTING_RECOVERED'],
    example: 'CREATED',
  })
  idempotencyOutcome!: 'CREATED' | 'EXISTING_RECOVERED';

  @ApiProperty({ description: 'ISO 8601 creation timestamp' })
  createdAt!: string;
}

export class UpdateTitleResponseDto {
  @ApiProperty({ description: 'Conversation ID', example: 'conv_123' })
  conversationId!: string;

  @ApiProperty({ description: 'Updated title', example: 'New Clinical Session' })
  title!: string;

  @ApiProperty({ description: 'ISO 8601 updated timestamp' })
  updatedAt!: string;
}

export class ArchiveConversationResponseDto {
  @ApiProperty({ description: 'Conversation ID', example: 'conv_123' })
  conversationId!: string;

  @ApiProperty({ description: 'Archive status', example: true })
  isArchived!: boolean;

  @ApiProperty({ description: 'ISO 8601 archiving timestamp' })
  archivedAt!: string;
}

export class AiConversationErrorResponseDto {
  @ApiProperty({ description: 'HTTP status code', example: 400 })
  statusCode!: number;

  @ApiProperty({ description: 'High-level HTTP error category', example: 'Bad Request' })
  error!: string;

  @ApiProperty({ description: 'Application error code', example: 'AI_INVALID_TURN_INPUT' })
  code!: string;

  @ApiProperty({
    description: 'Human-readable, safe error message',
    example: 'userPrompt must not be empty or contain only whitespace',
  })
  message!: string;

  @ApiProperty({
    description: 'Request URI path where error occurred',
    example: '/api/v1/ai/conversations',
  })
  path!: string;

  @ApiProperty({
    description: 'ISO 8601 timestamp of error occurrence',
    example: '2026-11-23T16:00:00.000Z',
  })
  timestamp!: string;
}

export class AuditInspectConversationRequestDto {
  @ApiProperty({
    description:
      'Mandatory clinical or supervisory justification for privileged conversation inspection (10 to 500 characters)',
    example: 'Clinical compliance audit for quarterly therapy review #2026-Q4',
    minLength: 10,
    maxLength: 500,
  })
  @IsString({ message: 'reason must be a string' })
  @IsNotBlank({ message: 'reason must not be empty or contain only whitespace' })
  @MinLength(10, { message: 'reason must be at least 10 characters' })
  @MaxLength(500, { message: 'reason must not exceed 500 characters' })
  reason!: string;
}

export class AuditInspectResponseDto {
  @ApiProperty({ description: 'Immutable audit log entry identifier', example: 'audit_log_123' })
  auditLogId!: string;

  @ApiProperty({
    description: 'Inspected conversation details',
    type: ConversationDetailResponseDto,
  })
  conversation!: ConversationDetailResponseDto;

  @ApiProperty({ description: 'Full message history', type: [MessageResponseDto] })
  messages!: MessageResponseDto[];

  @ApiProperty({ description: 'ISO 8601 inspection timestamp' })
  inspectedAt!: string;
}

export class CancelTurnRequestDto {
  @ApiPropertyOptional({
    description: 'Optional human-readable cancellation reason',
    example: 'User requested cancellation',
    maxLength: 500,
  })
  @IsOptional()
  @IsString({ message: 'reason must be a string' })
  @MaxLength(500, { message: 'reason must not exceed 500 characters' })
  reason?: string;
}

export class CancelTurnResponseDto {
  @ApiProperty({ description: 'Conversation ID', example: 'conv_123' })
  conversationId!: string;

  @ApiProperty({ description: 'Turn ID', example: 'turn_123' })
  turnId!: string;

  @ApiProperty({
    description: 'Turn lifecycle status',
    enum: TurnStatus,
    example: TurnStatus.CANCELLED,
  })
  turnStatus!: TurnStatus;

  @ApiProperty({
    description: 'Assistant attempt placeholder message identifier',
    example: 'msg_assistant_123',
  })
  assistantMessageId!: string;

  @ApiProperty({
    description: 'Whether the turn was already cancelled prior to this request',
    example: false,
  })
  isAlreadyCancelled!: boolean;

  @ApiProperty({ description: 'ISO 8601 cancellation timestamp' })
  cancelledAt!: string;
}
