import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { VisibilityScope, IngestionStatus } from '@kinergy-platform/core';

export class UploadDocumentRequestDto {
  @ApiPropertyOptional({
    description: 'User-facing title of the knowledge document',
    example: 'Kinesiology Clinical Protocol',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({
    description: 'Detailed description of document content and purpose',
    example: 'Standard guidelines for cervical spine evaluation and exercise therapies.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Visibility scope controlling tenant access level',
    enum: VisibilityScope,
    default: VisibilityScope.ALL_STAFF,
  })
  @IsOptional()
  @IsEnum(VisibilityScope)
  visibilityScope?: VisibilityScope;

  @ApiPropertyOptional({
    description: 'ISO language code of the document',
    example: 'en',
    default: 'en',
  })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;
}

export class UpdateDocumentMetadataRequestDto {
  @ApiPropertyOptional({
    description: 'Updated document title',
    example: 'Updated Cervical Spine Protocol',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({
    description: 'Updated document description',
    example: 'Revised guidance including 2026 exercise therapies.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    enum: VisibilityScope,
    description: 'Updated visibility access scope',
  })
  @IsOptional()
  @IsEnum(VisibilityScope)
  visibilityScope?: VisibilityScope;
}

export class ListDocumentsQueryDto {
  @ApiPropertyOptional({
    description: '1-indexed page number for pagination. Default: 1.',
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page (1-100). Default: 20.',
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ description: 'Case-insensitive search term against document title' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: VisibilityScope, description: 'Filter by visibility access scope' })
  @IsOptional()
  @IsEnum(VisibilityScope)
  visibilityScope?: VisibilityScope;

  @ApiPropertyOptional({ description: 'Filter by MIME type (e.g. application/pdf, text/markdown)' })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional({ description: 'Filter by uploader user ID' })
  @IsOptional()
  @IsString()
  uploadedBy?: string;

  @ApiPropertyOptional({ description: 'Creation date lower bound (ISO-8601 string)' })
  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @ApiPropertyOptional({ description: 'Creation date upper bound (ISO-8601 string)' })
  @IsOptional()
  @IsDateString()
  createdTo?: string;

  @ApiPropertyOptional({ enum: ['createdAt', 'updatedAt', 'title'], default: 'createdAt' })
  @IsOptional()
  @IsString()
  orderBy: 'createdAt' | 'updatedAt' | 'title' = 'createdAt';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'desc' })
  @IsOptional()
  @IsString()
  orderDirection: 'asc' | 'desc' = 'desc';
}

export class UploadDocumentResponseDto {
  @ApiProperty({ example: 'doc_c1a2b3c4d5e6' })
  documentId!: string;

  @ApiProperty({ example: 'ver_01' })
  versionId!: string;

  @ApiProperty({ example: 1 })
  versionNumber!: number;

  @ApiProperty({ example: 'Cervical Spine Protocol' })
  title!: string;

  @ApiProperty({ example: 'cervical-spine-protocol.pdf' })
  originalFileName!: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType!: string;

  @ApiProperty({ example: 204857 })
  fileSize!: number;

  @ApiProperty({ example: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' })
  checksum!: string;

  @ApiProperty({ enum: VisibilityScope, example: VisibilityScope.ALL_STAFF })
  visibilityScope!: VisibilityScope;

  @ApiProperty({ example: 'job_98a7b6c5' })
  ingestionJobId!: string;

  @ApiProperty({ enum: IngestionStatus, example: IngestionStatus.UPLOADED })
  ingestionStatus!: IngestionStatus;

  @ApiProperty({ example: '2026-11-19T12:00:00.000Z' })
  createdAt!: string;
}

export class DocumentVersionResponseDto {
  @ApiProperty({ example: 'ver_01' })
  id!: string;

  @ApiProperty({ example: 1 })
  versionNumber!: number;

  @ApiProperty({ example: 'cervical-spine-protocol.pdf' })
  originalFileName!: string;

  @ApiProperty({ example: 'application/pdf' })
  mimeType!: string;

  @ApiProperty({ example: 204857 })
  fileSize!: number;

  @ApiProperty({ example: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' })
  checksum!: string;

  @ApiProperty({ example: 'en' })
  language!: string;

  @ApiProperty({ example: 'usr_therapist_01' })
  uploadedBy!: string;

  @ApiProperty({ example: '2026-11-19T12:00:00.000Z' })
  createdAt!: string;
}

export class DocumentDetailResponseDto {
  @ApiProperty({ example: 'doc_c1a2b3c4d5e6' })
  id!: string;

  @ApiProperty({ example: 'Cervical Spine Protocol' })
  title!: string;

  @ApiPropertyOptional({ example: 'Standard clinical evaluation guidelines' })
  description?: string;

  @ApiProperty({ enum: VisibilityScope, example: VisibilityScope.ALL_STAFF })
  visibilityScope!: VisibilityScope;

  @ApiProperty({ example: 'ver_01' })
  currentVersionId!: string;

  @ApiProperty({ type: [DocumentVersionResponseDto] })
  versions!: DocumentVersionResponseDto[];

  @ApiProperty({ example: 'usr_therapist_01' })
  uploadedBy!: string;

  @ApiProperty({ example: '2026-11-19T12:00:00.000Z' })
  createdAt!: string;

  @ApiProperty({ example: '2026-11-19T12:00:00.000Z' })
  updatedAt!: string;
}

export class PaginatedDocumentsResponseDto {
  @ApiProperty({ type: [DocumentDetailResponseDto] })
  items!: DocumentDetailResponseDto[];

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

  get data(): DocumentDetailResponseDto[] {
    return this.items;
  }
}

export class IngestionJobResponseDto {
  @ApiProperty({ example: 'job_123' })
  id!: string;

  @ApiProperty({ example: 'doc_123' })
  documentId!: string;

  @ApiProperty({ example: 'ver_01' })
  documentVersionId!: string;

  @ApiProperty({ enum: IngestionStatus, example: IngestionStatus.READY })
  status!: IngestionStatus;

  @ApiProperty({ example: 1 })
  attemptCount!: number;

  @ApiProperty({ example: 3 })
  maxAttempts!: number;

  @ApiPropertyOptional({ example: null })
  lastErrorCode?: string | null;

  @ApiPropertyOptional({ example: null })
  lastErrorMessage?: string | null;

  @ApiProperty({ example: '2026-11-19T12:00:00.000Z' })
  createdAt!: string;

  @ApiPropertyOptional({ example: '2026-11-19T12:01:00.000Z' })
  completedAt?: string | null;
}

export class CancelIngestionJobRequestDto {
  @ApiPropertyOptional({
    description: 'Reason for manual cancellation',
    example: 'Superseded by newer revision',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
