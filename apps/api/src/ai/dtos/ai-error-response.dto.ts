import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Standardized API error response envelope for all Kynergy Intelligence endpoints.
 * Conforms to the platform error format while providing typed error codes,
 * correlation tracing, sanitized messages, and authoritative retryability metadata.
 */
export class AiErrorResponseDto {
  @ApiProperty({ description: 'HTTP status code', example: 400 })
  statusCode!: number;

  @ApiProperty({ description: 'High-level HTTP error category', example: 'Bad Request' })
  error!: string;

  @ApiProperty({
    description: 'Authoritative machine-readable error classification code',
    example: 'AI_INVALID_TURN_INPUT',
  })
  code!: string;

  @ApiProperty({
    description: 'Safe, human-readable, sanitized error message',
    example: 'Query cannot be empty or contain only whitespace.',
  })
  message!: string;

  @ApiProperty({
    description: 'Request URI path where error occurred',
    example: '/api/v1/ai/knowledge/query',
  })
  path!: string;

  @ApiProperty({
    description: 'ISO 8601 timestamp of error occurrence',
    example: '2026-11-26T12:00:00.000Z',
  })
  timestamp!: string;

  @ApiPropertyOptional({
    description: 'Request or correlation identifier for distributed tracing and log lookup',
    example: 'req-abc-123',
  })
  correlationId?: string;

  @ApiPropertyOptional({
    description: 'Authoritative indication of whether the client can safely retry the operation',
    example: false,
  })
  retryable?: boolean;

  @ApiPropertyOptional({
    description:
      'Recommended delay in seconds before retrying (provided on rate limits or concurrent lease waits)',
    example: 2,
  })
  retryAfterSeconds?: number;

  @ApiPropertyOptional({
    description: 'Optional safe structured validation or context details',
    type: 'object',
    additionalProperties: true,
  })
  details?: Record<string, unknown>;
}
