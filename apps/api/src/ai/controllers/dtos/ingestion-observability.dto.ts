import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import {
  IngestionStatus,
  IngestionStageId,
  IngestionStageStatus,
  IngestionFailureCategory,
} from '@kinergy-platform/core';

export class IngestionFailureInfoDto {
  @ApiProperty({ description: 'Stable error code', example: 'STORAGE_TIMEOUT' })
  code!: string;

  @ApiProperty({
    enum: IngestionFailureCategory,
    description: 'High-level error category',
    example: IngestionFailureCategory.STORAGE,
  })
  category!: IngestionFailureCategory;

  @ApiProperty({
    description: 'Sanitized, safe human-readable diagnostic message',
    example: 'Storage or processing connection timed out.',
  })
  message!: string;

  @ApiProperty({
    enum: IngestionStageId,
    description: 'Pipeline stage where the failure occurred',
    example: IngestionStageId.PROCESSING,
  })
  failedStage!: IngestionStageId;

  @ApiProperty({
    description: 'Whether this failure qualifies for automated or manual retry',
    example: true,
  })
  isRetryable!: boolean;

  @ApiProperty({
    description: 'ISO timestamp when the failure occurred',
    example: '2026-11-26T10:00:00.000Z',
  })
  failedAt!: string;

  @ApiProperty({ description: 'Execution attempt number when failure occurred', example: 1 })
  attemptNumber!: number;
}

export class IngestionStageMetricsDto {
  @ApiPropertyOptional({ description: 'Number of textual chunks created', example: 42 })
  totalChunks?: number;

  @ApiPropertyOptional({
    description: 'Number of chunks successfully embedded and indexed',
    example: 42,
  })
  indexedChunks?: number;

  @ApiPropertyOptional({
    description: 'Identifier of the target IndexGeneration',
    example: 'gen_active_01',
  })
  indexGenerationId?: string | null;
}

export class IngestionStageInfoDto {
  @ApiProperty({
    enum: IngestionStageId,
    description: 'Unique stage identifier',
    example: IngestionStageId.PROCESSING,
  })
  stage!: IngestionStageId;

  @ApiProperty({
    description: 'Human-readable localized title of the stage',
    example: 'Extracción de Texto y Fragmentación',
  })
  label!: string;

  @ApiProperty({
    enum: IngestionStageStatus,
    description: 'Discrete lifecycle status of the stage',
    example: IngestionStageStatus.COMPLETED,
  })
  status!: IngestionStageStatus;

  @ApiPropertyOptional({
    description: 'ISO timestamp when stage execution started (or null if pending/unreached)',
    example: '2026-11-26T10:00:00.000Z',
  })
  startedAt?: string | null;

  @ApiPropertyOptional({
    description:
      'ISO timestamp when stage execution completed (or null if in progress or unrecorded)',
    example: '2026-11-26T10:00:15.000Z',
  })
  completedAt?: string | null;

  @ApiPropertyOptional({
    description: 'Duration of the stage in milliseconds if measurable',
    example: 15000,
  })
  durationMs?: number | null;

  @ApiPropertyOptional({
    type: IngestionFailureInfoDto,
    description: 'Failure information if this stage failed',
  })
  failureInfo?: IngestionFailureInfoDto | null;

  @ApiPropertyOptional({
    type: IngestionStageMetricsDto,
    description: 'Quantitative progress metrics for the stage',
  })
  metrics?: IngestionStageMetricsDto | null;
}

export class IngestionRetrievalStatusDto {
  @ApiProperty({
    description:
      'Authoritative readiness for grounded semantic retrieval: chunks exist, embeddings bound to active generation, and document active',
    example: true,
  })
  isReadyForRetrieval!: boolean;

  @ApiPropertyOptional({
    description: 'ID of the active index generation for the tenant',
    example: 'gen_active_01',
  })
  activeGenerationId?: string | null;

  @ApiProperty({ description: 'Total persisted chunks for this document version', example: 42 })
  totalChunks!: number;

  @ApiProperty({ description: 'Total indexed chunks in the active generation', example: 42 })
  indexedChunks!: number;

  @ApiProperty({
    description: 'Total vector embeddings stored for this document version',
    example: 42,
  })
  embeddingsCount!: number;

  @ApiProperty({
    description: 'Authoritative reason or readiness diagnosis',
    example: 'Document version is fully indexed and available for semantic retrieval.',
  })
  reason!: string;

  @ApiPropertyOptional({ description: 'Evaluated target version ID', example: 'ver_02' })
  targetVersionId?: string | null;

  @ApiPropertyOptional({ description: 'Evaluated target version number', example: 2 })
  targetVersionNumber?: number | null;

  @ApiPropertyOptional({ description: 'Current document version ID', example: 'ver_02' })
  currentVersionId?: string | null;

  @ApiPropertyOptional({ description: 'Current document version number', example: 2 })
  currentVersionNumber?: number | null;

  @ApiPropertyOptional({
    description: 'Version ID currently committed and active in the vector retrieval index, if any',
    example: 'ver_01',
  })
  indexedVersionId?: string | null;

  @ApiPropertyOptional({
    description:
      'Version number currently committed and active in the vector retrieval index, if any',
    example: 1,
  })
  indexedVersionNumber?: number | null;

  @ApiPropertyOptional({
    description:
      'Whether the current document version differs from the version currently indexed in RAG',
    example: true,
  })
  hasVersionDiscrepancy?: boolean;

  @ApiPropertyOptional({
    description: 'Authoritative explanation of the version discrepancy',
    example: 'Current version v2 is processing while previous version v1 remains active in index.',
  })
  discrepancyReason?: string | null;

  @ApiPropertyOptional({
    description:
      'ISO timestamp of the last successful indexing run for any version of this document',
    example: '2026-11-25T12:00:00.000Z',
  })
  lastSuccessfulIndexingAt?: string | null;
}

export class EnrichedIngestionJobResponseDto {
  @ApiProperty({ example: 'job_c1a2b3c4d5e6' })
  id!: string;

  @ApiProperty({ example: 'doc_c1a2b3c4d5e6' })
  documentId!: string;

  @ApiProperty({ example: 'ver_01' })
  documentVersionId!: string;

  @ApiProperty({ enum: IngestionStatus, example: IngestionStatus.READY })
  status!: IngestionStatus;

  @ApiProperty({
    description: 'Current executing or final pipeline stage',
    example: 'INDEXING',
  })
  currentStage!: string;

  @ApiProperty({ example: 1 })
  attemptCount!: number;

  @ApiProperty({ example: 3 })
  maxAttempts!: number;

  @ApiProperty({ example: '2026-11-26T10:00:00.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({ example: '2026-11-26T10:00:01.000Z' })
  startedAt?: string | null;

  @ApiPropertyOptional({ example: '2026-11-26T10:00:30.000Z' })
  completedAt?: string | null;

  @ApiPropertyOptional({ example: null })
  nextRetryAt?: string | null;

  @ApiPropertyOptional({ example: null })
  cancelledAt?: string | null;

  @ApiPropertyOptional({ example: null })
  cancellationReason?: string | null;

  @ApiPropertyOptional({ description: 'Total elapsed or finished duration in ms', example: 29000 })
  durationMs?: number | null;

  @ApiProperty({ description: 'Whether the job has reached a terminal state', example: true })
  isTerminal!: boolean;

  @ApiProperty({ description: 'Whether the job can be retried', example: false })
  canRetry!: boolean;

  @ApiPropertyOptional({ example: null })
  lastErrorCode?: string | null;

  @ApiPropertyOptional({ example: null })
  lastErrorMessage?: string | null;

  @ApiPropertyOptional({
    type: IngestionFailureInfoDto,
    description: 'Safe structured failure details if failed',
  })
  failureInfo?: IngestionFailureInfoDto | null;

  @ApiProperty({
    type: [IngestionStageInfoDto],
    description: 'Fine-grained stage progression for pipeline observability',
  })
  stages!: IngestionStageInfoDto[];

  @ApiPropertyOptional({
    type: IngestionRetrievalStatusDto,
    description: 'Authoritative semantic search retrieval readiness',
  })
  retrievalStatus?: IngestionRetrievalStatusDto;
}

export class PaginatedIngestionJobsResponseDto {
  @ApiProperty({ type: [EnrichedIngestionJobResponseDto] })
  items!: EnrichedIngestionJobResponseDto[];

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 45 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;

  @ApiProperty({ example: true })
  hasNextPage!: boolean;

  @ApiProperty({ example: false })
  hasPreviousPage!: boolean;
}

export class ListIngestionJobsQueryDto {
  @ApiPropertyOptional({
    enum: IngestionStatus,
    description: 'Filter by ingestion job status',
  })
  @IsOptional()
  @IsEnum(IngestionStatus)
  status?: IngestionStatus;

  @ApiPropertyOptional({ description: 'Filter by parent document ID' })
  @IsOptional()
  @IsString()
  documentId?: string;

  @ApiPropertyOptional({ description: 'Filter by specific document version ID' })
  @IsOptional()
  @IsString()
  documentVersionId?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    enum: ['createdAt', 'startedAt', 'completedAt'],
    default: 'createdAt',
  })
  @IsOptional()
  @IsString()
  orderBy?: 'createdAt' | 'startedAt' | 'completedAt' = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsString()
  orderDirection?: 'asc' | 'desc' = 'desc';
}
