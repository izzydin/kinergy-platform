import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Inject,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { IIngestionJobRepositoryPort } from '@kinergy-platform/core';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import {
  CurrentUser,
  AuthenticatedUserPayload,
} from '../../platform/identity/decorators/current-user.decorator';
import { INGESTION_OBSERVABILITY_SERVICE, INGESTION_JOB_REPOSITORY } from '../ai.tokens';
import { IngestionObservabilityService } from '../services/ingestion-observability.service';
import {
  EnrichedIngestionJobResponseDto,
  IngestionRetrievalStatusDto,
  ListIngestionJobsQueryDto,
  PaginatedIngestionJobsResponseDto,
} from './dtos/ingestion-observability.dto';

/**
 * Controller exposing administrative tenant-wide ingestion and indexing monitoring.
 * Provides queue oversight, stage-level diagnostics, failure inspection, and retrieval readiness.
 */
@ApiTags('AI - Ingestion & Indexing Monitoring')
@ApiBearerAuth()
@Controller(['api/v1/ai/knowledge/ingestion', 'api/v1/ai/ingestion'])
@UseGuards(AuthenticationGuard, AuthorizationGuard)
export class AiIngestionController {
  constructor(
    @Inject(INGESTION_OBSERVABILITY_SERVICE)
    private readonly observabilityService: IngestionObservabilityService,
    @Inject(INGESTION_JOB_REPOSITORY)
    private readonly ingestionJobRepo: IIngestionJobRepositoryPort,
  ) {}

  /**
   * 1. GET /api/v1/ai/knowledge/ingestion/jobs
   * Lists cross-document ingestion jobs with server-side pagination and filters.
   */
  @Get('jobs')
  @ApiOperation({
    summary: 'List tenant ingestion jobs',
    description:
      'Returns tenant-scoped, paginated ingestion jobs with filtering by status and document identifiers.',
  })
  @ApiResponse({ status: 200, type: PaginatedIngestionJobsResponseDto })
  @ApiResponse({ status: 401, description: 'Missing or invalid authentication token' })
  @ApiResponse({ status: 403, description: 'Administrative authorization required' })
  async listJobs(
    @CurrentUser() user: AuthenticatedUserPayload | null,
    @Query() query: ListIngestionJobsQueryDto,
  ): Promise<PaginatedIngestionJobsResponseDto> {
    const { tenantId } = this.extractAuthContext(user);
    this.assertCanManage(user);

    return this.observabilityService.listTenantIngestionJobs(
      tenantId,
      {
        status: query.status,
        documentId: query.documentId?.trim(),
        documentVersionId: query.documentVersionId?.trim(),
        limit: query.limit,
        offset: query.page && query.limit ? (query.page - 1) * query.limit : 0,
        orderBy: query.orderBy,
        orderDirection: query.orderDirection,
      },
      user,
    );
  }

  /**
   * 2. GET /api/v1/ai/knowledge/ingestion/jobs/:jobId
   * Retrieves fine-grained diagnostics and stage progression for a single ingestion job.
   */
  @Get('jobs/:jobId')
  @ApiOperation({ summary: 'Get ingestion job diagnostics by ID' })
  @ApiParam({ name: 'jobId', description: 'Unique Ingestion Job identifier' })
  @ApiResponse({ status: 200, type: EnrichedIngestionJobResponseDto })
  @ApiResponse({ status: 404, description: 'Ingestion job not found' })
  async getJobById(
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedUserPayload | null,
  ): Promise<EnrichedIngestionJobResponseDto> {
    const { tenantId } = this.extractAuthContext(user);
    this.assertCanManage(user);

    const job = await this.ingestionJobRepo.findById(tenantId, jobId);
    if (!job) {
      throw new NotFoundException(`Ingestion job '${jobId}' was not found.`);
    }

    return this.observabilityService.enrichJobDto(tenantId, job);
  }

  /**
   * 3. GET /api/v1/ai/knowledge/ingestion/retrieval-status/:documentId
   * Authoritative semantic search retrieval readiness evaluation for a document.
   */
  @Get('retrieval-status/:documentId')
  @ApiOperation({
    summary: 'Evaluate document retrieval readiness',
    description:
      'Checks if a document satisfies all retrieval-readiness invariants: chunks exist, embeddings bound to active generation, and not deleted.',
  })
  @ApiParam({ name: 'documentId', description: 'Logical Knowledge Document identifier' })
  @ApiResponse({ status: 200, type: IngestionRetrievalStatusDto })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async evaluateReadiness(
    @Param('documentId') documentId: string,
    @CurrentUser() user: AuthenticatedUserPayload | null,
    @Query('versionId') versionId?: string,
  ): Promise<IngestionRetrievalStatusDto> {
    const { tenantId } = this.extractAuthContext(user);

    return this.observabilityService.evaluateRetrievalReadiness(
      tenantId,
      documentId,
      versionId?.trim(),
      user,
    );
  }

  // --- Auth & Permission Guards ---

  private extractAuthContext(user: AuthenticatedUserPayload | null): {
    tenantId: string;
    userId: string;
  } {
    if (!user) {
      throw new UnauthorizedException('Authentication credentials missing or invalid.');
    }
    const tenantId = user.tenantId;
    if (!tenantId) {
      throw new ForbiddenException('Authenticated user is not assigned to a tenant.');
    }
    const userId = user.id || user.userId;
    if (!userId) {
      throw new UnauthorizedException('Authenticated user ID is missing.');
    }
    return { tenantId, userId };
  }

  private assertCanManage(user: AuthenticatedUserPayload | null): void {
    if (!user) {
      throw new ForbiddenException('Authentication required.');
    }
    const roles = (user.roles ?? []).map((r) => r.toLowerCase());
    const isPrivileged = roles.some((r) =>
      ['owner', 'superadmin', 'admin', 'administrator', 'manager', 'management', 'gestor'].includes(
        r,
      ),
    );
    if (!isPrivileged) {
      throw new ForbiddenException(
        'Administrative or management clearance required to access cross-document ingestion monitoring.',
      );
    }
  }
}
