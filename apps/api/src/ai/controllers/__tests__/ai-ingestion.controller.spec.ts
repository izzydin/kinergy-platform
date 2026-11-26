import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { IngestionJob, IngestionStatus, IIngestionJobRepositoryPort } from '@kinergy-platform/core';
import { AiIngestionController } from '../ai-ingestion.controller';
import { IngestionObservabilityService } from '../../services/ingestion-observability.service';
import { AuthenticatedUserPayload } from '../../../platform/identity/decorators/current-user.decorator';
import { EnrichedIngestionJobResponseDto } from '../dtos/ingestion-observability.dto';

describe('AiIngestionController (Unit & Monitoring Contract)', () => {
  let controller: AiIngestionController;
  let mockObservabilityService: jest.Mocked<IngestionObservabilityService>;
  let mockIngestionRepo: jest.Mocked<IIngestionJobRepositoryPort>;

  const tenantA = 'tenant_clinic_01';
  const adminUser: AuthenticatedUserPayload = {
    id: 'usr_admin_01',
    email: 'admin@clinic.com',
    status: 'ACTIVE',
    roles: ['ADMIN'],
    permissions: ['ai:documents:manage'],
    tenantId: tenantA,
  };

  const viewerUser: AuthenticatedUserPayload = {
    id: 'usr_viewer_01',
    email: 'viewer@clinic.com',
    status: 'ACTIVE',
    roles: ['VIEWER'],
    permissions: ['ai:documents:read'],
    tenantId: tenantA,
  };

  beforeEach(() => {
    mockObservabilityService = {
      listTenantIngestionJobs: jest.fn().mockResolvedValue({
        items: [],
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 1,
        hasNextPage: false,
        hasPreviousPage: false,
      }),
      enrichJobDto: jest.fn().mockResolvedValue({
        id: 'job_123',
        documentId: 'doc_123',
        documentVersionId: 'ver_01',
        status: IngestionStatus.READY,
        currentStage: 'READY',
        attemptCount: 1,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        isTerminal: true,
        canRetry: false,
        stages: [],
      } as unknown as EnrichedIngestionJobResponseDto),
      evaluateRetrievalReadiness: jest.fn().mockResolvedValue({
        isReadyForRetrieval: true,
        activeGenerationId: 'gen_01',
        totalChunks: 5,
        indexedChunks: 5,
        embeddingsCount: 5,
        reason: 'Ready',
      }),
    } as unknown as jest.Mocked<IngestionObservabilityService>;

    mockIngestionRepo = {
      findById: jest.fn().mockResolvedValue(null),
    } as unknown as jest.Mocked<IIngestionJobRepositoryPort>;

    controller = new AiIngestionController(mockObservabilityService, mockIngestionRepo);
  });

  describe('GET /api/v1/ai/knowledge/ingestion/jobs', () => {
    it('returns paginated ingestion jobs for administrative user', async () => {
      const result = await controller.listJobs(adminUser, { page: 1, limit: 10 });
      expect(result).toBeDefined();
      expect(mockObservabilityService.listTenantIngestionJobs).toHaveBeenCalledWith(
        tenantA,
        expect.objectContaining({ limit: 10, offset: 0 }),
        adminUser,
      );
    });

    it('rejects non-administrative users with ForbiddenException', async () => {
      await expect(controller.listJobs(viewerUser, {})).rejects.toThrow(ForbiddenException);
    });

    it('throws UnauthorizedException when user context is null', async () => {
      await expect(controller.listJobs(null, {})).rejects.toThrow(UnauthorizedException);
    });

    it('throws ForbiddenException when tenantId is missing', async () => {
      const userWithoutTenant = { ...adminUser, tenantId: '' as unknown as string };
      await expect(controller.listJobs(userWithoutTenant, {})).rejects.toThrow(ForbiddenException);
    });
  });

  describe('GET /api/v1/ai/knowledge/ingestion/jobs/:jobId', () => {
    it('returns enriched job diagnostics when job exists', async () => {
      const mockJob = IngestionJob.create({
        id: 'job_abc',
        tenantId: tenantA,
        documentId: 'doc_123',
        documentVersionId: 'ver_01',
      });
      mockIngestionRepo.findById.mockResolvedValue(mockJob);

      const result = await controller.getJobById('job_abc', adminUser);

      expect(result).toBeDefined();
      expect(mockIngestionRepo.findById).toHaveBeenCalledWith(tenantA, 'job_abc');
      expect(mockObservabilityService.enrichJobDto).toHaveBeenCalledWith(tenantA, mockJob);
    });

    it('throws NotFoundException when job is not found', async () => {
      mockIngestionRepo.findById.mockResolvedValue(null);

      await expect(controller.getJobById('job_missing', adminUser)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('rejects non-administrative users with ForbiddenException', async () => {
      await expect(controller.getJobById('job_abc', viewerUser)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('GET /api/v1/ai/knowledge/ingestion/retrieval-status/:documentId', () => {
    it('evaluates retrieval readiness for a document', async () => {
      const result = await controller.evaluateReadiness('doc_123', adminUser, 'ver_01');

      expect(result.isReadyForRetrieval).toBe(true);
      expect(mockObservabilityService.evaluateRetrievalReadiness).toHaveBeenCalledWith(
        tenantA,
        'doc_123',
        'ver_01',
        adminUser,
      );
    });
  });
});
