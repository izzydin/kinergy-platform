import { z } from 'zod';
import type {
  ChatMessageDto,
  QueryKnowledgeRequestDto,
  RAGAnswerResponseDto,
  RAGMetadataDto,
  RAGSourceCitationDto,
} from '../types/assistant.types';

/**
 * Runtime schema for ChatMessageDto validating individual conversation turns.
 */
export const chatMessageDtoSchema: z.ZodType<ChatMessageDto> = z.object({
  role: z.enum(['system', 'user', 'assistant']),
  content: z.string().min(1, 'Message content cannot be empty.').max(4000),
});

/**
 * Runtime schema for QueryKnowledgeRequestDto matching backend validation rules.
 */
export const queryKnowledgeRequestSchema: z.ZodType<QueryKnowledgeRequestDto> = z.object({
  query: z
    .string()
    .trim()
    .min(3, 'Query must be at least 3 characters long.')
    .max(1000, 'Query cannot exceed 1000 characters.'),
  searchMode: z.enum(['SEMANTIC', 'KEYWORD', 'HYBRID']).optional(),
  topK: z.number().int().min(1).max(20).optional(),
  conversationHistory: z.array(chatMessageDtoSchema).optional(),
  conversationId: z.string().uuid().optional(),
});

/**
 * Runtime schema for RAGSourceCitationDto validating source evidence citations.
 */
export const ragSourceCitationSchema: z.ZodType<RAGSourceCitationDto> = z.object({
  documentId: z.string().min(1, 'Document identifier is required.'),
  documentTitle: z.string().min(1, 'Document title is required.'),
  chunkId: z.string().min(1, 'Chunk identifier is required.'),
  excerpt: z.string().optional(),
  pageNumber: z.number().int().positive().optional(),
  headingPath: z.array(z.string()).optional(),
  relevanceScore: z.number().min(0).max(1),
  retrievalRank: z.number().int().nonnegative().optional(),
  sourceStrategy: z.string().optional(),
  documentVersionId: z.string().optional(),
  documentVersionNumber: z.number().int().positive().optional(),
});

/**
 * Runtime schema for RAGMetadataDto validating telemetry and performance metrics.
 */
export const ragMetadataSchema: z.ZodType<RAGMetadataDto> = z.object({
  model: z.string().min(1, 'Model identifier is required.'),
  retrievalCount: z.number().int().nonnegative(),
  latencyMs: z.number().nonnegative(),
  finishReason: z.string().optional(),
});

/**
 * Runtime schema for RAGAnswerResponseDto validating backend response envelopes.
 */
export const ragAnswerResponseSchema: z.ZodType<RAGAnswerResponseDto> = z.object({
  answer: z.string(),
  grounded: z.boolean(),
  sources: z.array(ragSourceCitationSchema),
  metadata: ragMetadataSchema,
});

/**
 * Validates a knowledge query request before dispatching it over the network.
 */
export function validateQueryKnowledgeRequest(data: unknown): QueryKnowledgeRequestDto {
  return queryKnowledgeRequestSchema.parse(data);
}

/**
 * Validates and safely parses the backend response envelope.
 */
export function parseRAGAnswerResponse(data: unknown): RAGAnswerResponseDto {
  return ragAnswerResponseSchema.parse(data);
}
