import {
  BadRequestException,
  ForbiddenException,
  GatewayTimeoutException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AiRAGController } from '../ai-rag.controller';
import {
  IGenerateGroundedAnswerUseCase,
  RAGAnswer,
  RAGSourceCitation,
  VisibilityScope,
  EmptyRetrievalQueryException,
  UnauthorizedRetrievalException,
  ConversationNotFoundException,
  ProviderTimeoutException,
  LLMProviderUnavailableException,
} from '@kinergy-platform/core';
import { RetrievalSecurityPolicyService } from '../../services/retrieval/retrieval-security-policy.service';
import { AuthenticatedUserPayload } from '../../../platform/identity/decorators/current-user.decorator';

describe('AiRAGController Unit Tests', () => {
  let controller: AiRAGController;
  let mockOrchestrator: jest.Mocked<IGenerateGroundedAnswerUseCase>;
  let mockSecurityPolicy: jest.Mocked<RetrievalSecurityPolicyService>;

  const mockUser: AuthenticatedUserPayload = {
    id: 'user-kinesio-001',
    email: 'kinesio@kinergy.com',
    status: 'ACTIVE',
    roles: ['therapist'],
    permissions: ['ai:read'],
    tenantId: 'tenant-clinica-alpha',
  };

  beforeEach(() => {
    mockOrchestrator = {
      execute: jest.fn(),
    };

    mockSecurityPolicy = {
      resolveAllowedVisibilityScopes: jest
        .fn()
        .mockReturnValue([VisibilityScope.ALL_STAFF, VisibilityScope.CLINICAL_STAFF]),
      resolveAuthorizedDocumentIds: jest.fn(),
    } as unknown as jest.Mocked<RetrievalSecurityPolicyService>;

    controller = new AiRAGController(mockOrchestrator, mockSecurityPolicy);
  });

  describe('Authentication and Tenant Validation', () => {
    it('should throw UnauthorizedException when authenticated user is null', async () => {
      await expect(controller.queryKnowledge(null, { query: '¿Protocolo LCA?' })).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw ForbiddenException when user tenantId is missing', async () => {
      const userWithoutTenant: AuthenticatedUserPayload = {
        ...mockUser,
        tenantId: null,
      };

      await expect(
        controller.queryKnowledge(userWithoutTenant, { query: '¿Protocolo LCA?' }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw UnauthorizedException when userId is missing', async () => {
      const userWithoutId: AuthenticatedUserPayload = {
        ...mockUser,
        id: '',
        userId: undefined,
      };

      await expect(
        controller.queryKnowledge(userWithoutId, { query: '¿Protocolo LCA?' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Successful RAG Execution', () => {
    it('should execute orchestrator and return mapped RAGAnswerResponseDto', async () => {
      const mockCitation = RAGSourceCitation.create({
        documentId: 'doc-lca-01',
        documentTitle: 'Protocolo LCA',
        chunkId: 'chk_acl_phase1',
        pageNumber: 2,
        relevanceScore: 0.95,
        sourceStrategy: 'HYBRID',
      });

      const mockAnswer = RAGAnswer.create({
        answer: 'Fase 1 LCA requiere crioterapia e isométricos.',
        grounded: true,
        sources: [mockCitation],
        metadata: {
          model: 'qwen3:4b',
          retrievalCount: 3,
          latencyMs: 1450,
          finishReason: 'stop',
        },
      });

      mockOrchestrator.execute.mockResolvedValue(mockAnswer);

      const response = await controller.queryKnowledge(mockUser, {
        query: '¿Pautas Fase 1 LCA?',
        conversationHistory: [
          { role: 'user', content: 'Hola' },
          { role: 'assistant', content: 'Hola, ¿en qué puedo ayudarte?' },
        ],
      });

      expect(mockSecurityPolicy.resolveAllowedVisibilityScopes).toHaveBeenCalledWith(['therapist']);
      expect(mockOrchestrator.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          query: '¿Pautas Fase 1 LCA?',
          authContext: expect.objectContaining({
            tenantId: 'tenant-clinica-alpha',
            userId: 'user-kinesio-001',
            allowedVisibilityScopes: [VisibilityScope.ALL_STAFF, VisibilityScope.CLINICAL_STAFF],
          }),
        }),
      );

      expect(response.grounded).toBe(true);
      expect(response.answer).toBe('Fase 1 LCA requiere crioterapia e isométricos.');
      expect(response.sources).toHaveLength(1);
      expect(response.sources[0]?.chunkId).toBe('chk_acl_phase1');
      expect(response.metadata.latencyMs).toBe(1450);
    });
  });

  describe('Exception Translation', () => {
    it('should map EmptyRetrievalQueryException to BadRequestException', async () => {
      mockOrchestrator.execute.mockRejectedValue(new EmptyRetrievalQueryException());

      await expect(controller.queryKnowledge(mockUser, { query: '   ' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should map UnauthorizedRetrievalException to ForbiddenException', async () => {
      mockOrchestrator.execute.mockRejectedValue(
        new UnauthorizedRetrievalException('Cross-tenant retrieval attempt blocked.'),
      );

      await expect(controller.queryKnowledge(mockUser, { query: '¿Doc privado?' })).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should map ConversationNotFoundException to NotFoundException', async () => {
      mockOrchestrator.execute.mockRejectedValue(
        new ConversationNotFoundException('conv-999', 'tenant-clinica-alpha'),
      );

      await expect(
        controller.queryKnowledge(mockUser, {
          query: '¿Continuación?',
          conversationId: 'conv-999',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should map ProviderTimeoutException to GatewayTimeoutException', async () => {
      mockOrchestrator.execute.mockRejectedValue(
        new ProviderTimeoutException('Ollama inference deadline exceeded.'),
      );

      await expect(
        controller.queryKnowledge(mockUser, { query: '¿Pregunta compleja?' }),
      ).rejects.toThrow(GatewayTimeoutException);
    });

    it('should map LLMProviderUnavailableException to ServiceUnavailableException', async () => {
      mockOrchestrator.execute.mockRejectedValue(
        new LLMProviderUnavailableException('Ollama connection refused.'),
      );

      await expect(controller.queryKnowledge(mockUser, { query: '¿Pregunta?' })).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });
});
