import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { RetrievalSearchMode } from '@kinergy-platform/core';

export class ChatMessageDto {
  @ApiProperty({
    description: 'Role of the message author in the conversation turn',
    enum: ['system', 'user', 'assistant'],
    example: 'user',
  })
  @IsString()
  @IsEnum(['system', 'user', 'assistant'])
  role!: 'system' | 'user' | 'assistant';

  @ApiProperty({
    description: 'Text content of the conversation message',
    example: '¿Cuál es el protocolo de ejercicios para el dolor cervical?',
  })
  @IsString()
  @MaxLength(4000)
  content!: string;
}

export class QueryKnowledgeRequestDto {
  @ApiProperty({
    description: 'User inquiry or question to be answered using verified retrieved knowledge',
    example: '¿Cuáles son las contraindicaciones del vendaje neuromuscular?',
  })
  @IsString()
  @MaxLength(1000)
  query!: string;

  @ApiPropertyOptional({
    description: 'Retrieval search mode: SEMANTIC, KEYWORD, or HYBRID (RRF)',
    enum: RetrievalSearchMode,
    default: RetrievalSearchMode.SEMANTIC,
  })
  @IsOptional()
  @IsEnum(RetrievalSearchMode)
  searchMode?: RetrievalSearchMode;

  @ApiPropertyOptional({
    description: 'Maximum number of candidate chunks to retrieve and consider for evidence context',
    minimum: 1,
    maximum: 20,
    default: 5,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  topK?: number;

  @ApiPropertyOptional({
    description: 'Prior conversation history turns for multi-turn conversational grounding',
    type: [ChatMessageDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  conversationHistory?: ChatMessageDto[];

  @ApiPropertyOptional({
    description: 'Unique conversation session ID for persistent multi-turn history tracking',
    example: 'c9b456e7-1234-4567-89ab-cdef01234567',
  })
  @IsOptional()
  @IsString()
  conversationId?: string;
}

export class RAGSourceCitationDto {
  @ApiProperty({
    description: 'Unique document identifier providing the evidence',
    example: 'd09a2b5e-4b72-4b21-8288-466fa1d9f8c1',
  })
  documentId!: string;

  @ApiProperty({
    description: 'Title of the knowledge document',
    example: 'Manual de Kinesiología y Vendaje Funcional',
  })
  documentTitle!: string;

  @ApiProperty({
    description: 'Exact knowledge chunk identifier supporting the generation',
    example: 'kc_018f3a5e-b5c6-7a1b-9f0e-1a2b3c4d5e6f',
  })
  chunkId!: string;

  @ApiPropertyOptional({
    description: 'Page number within the source document where chunk originates',
    example: 14,
  })
  pageNumber?: number;

  @ApiPropertyOptional({
    description: 'Hierarchical section path of headings containing the chunk',
    example: ['Capítulo 2: Técnicas de Vendaje', 'Contraindicaciones Absolutas'],
    type: [String],
  })
  headingPath?: string[];

  @ApiProperty({
    description: 'Similarity or fused relevance score in [0.0, 1.0]',
    example: 0.942,
  })
  relevanceScore!: number;

  @ApiPropertyOptional({
    description: 'Strategy that surfaced this chunk (SEMANTIC, KEYWORD, HYBRID, RERANKED)',
    example: 'HYBRID',
  })
  sourceStrategy?: string;

  @ApiPropertyOptional({
    description: 'Direct text excerpt from the retrieved knowledge chunk',
    example: 'El vendaje neuromuscular está contraindicado en casos de trombosis...',
  })
  excerpt?: string;

  @ApiPropertyOptional({
    description: 'Document version identifier',
    example: 'ver_018f3a5e-b5c6-7a1b-9f0e-1a2b3c4d5e6f',
  })
  documentVersionId?: string;

  @ApiPropertyOptional({
    description: 'Document version sequence number',
    example: 1,
  })
  documentVersionNumber?: number;

  @ApiPropertyOptional({
    description: 'Rank of the chunk within the retrieval stage',
    example: 1,
  })
  retrievalRank?: number;
}

export class RAGMetadataDto {
  @ApiProperty({
    description: 'Model identifier utilized for generation',
    example: 'qwen3:4b',
  })
  model!: string;

  @ApiProperty({
    description: 'Total number of candidate chunks retrieved before context budgeting',
    example: 5,
  })
  retrievalCount!: number;

  @ApiProperty({
    description: 'End-to-end RAG execution latency in milliseconds',
    example: 320,
  })
  latencyMs!: number;

  @ApiPropertyOptional({
    description: 'Model finish reason (stop, length, insufficient_context, cancelled)',
    example: 'stop',
  })
  finishReason?: string;
}

export class RAGAnswerResponseDto {
  @ApiProperty({
    description: 'Synthesized, grounded answer strictly supported by the retrieved evidence',
    example:
      'El vendaje neuromuscular está contraindicado en casos de trombosis venosa profunda activa, heridas abiertas e infecciones cutáneas agudas.',
  })
  answer!: string;

  @ApiProperty({
    description:
      'Indicates whether the answer is fully supported by retrieved evidence without hallucination',
    example: true,
  })
  grounded!: boolean;

  @ApiProperty({
    description: 'Verifiable source citations used to construct the answer',
    type: [RAGSourceCitationDto],
  })
  sources!: RAGSourceCitationDto[];

  @ApiProperty({
    description: 'Execution telemetry and metadata',
    type: RAGMetadataDto,
  })
  metadata!: RAGMetadataDto;
}
