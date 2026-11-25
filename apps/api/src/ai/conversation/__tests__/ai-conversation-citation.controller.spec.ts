import { Test, TestingModule } from '@nestjs/testing';
import { AiConversationController } from '../ai-conversation.controller';
import { AuthenticationGuard } from '../../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../../platform/identity/authorization/authorization.guard';
import {
  CreateConversationWithInitialTurnUseCase,
  ReserveConversationTurnUseCase,
  GetConversationUseCase,
  ListConversationsUseCase,
  GetMessageHistoryUseCase,
  UpdateConversationTitleUseCase,
  ArchiveConversationUseCase,
  PrivilegedInspectConversationUseCase,
  CancelConversationTurnUseCase,
  GetMessageCitationsUseCase,
  GetCitationDetailUseCase,
  CitationNotFoundError,
  ConversationNotFoundError,
  MessageNotFoundError,
} from '@kinergy-platform/core';
import { TrustedAiContext } from '../decorators/trusted-ai-context.decorator';

describe('AiConversationController — Citation Endpoints Unit Tests', () => {
  let controller: AiConversationController;
  let getCitationsUseCase: jest.Mocked<GetMessageCitationsUseCase>;
  let getCitationDetailUseCase: jest.Mocked<GetCitationDetailUseCase>;

  const mockAuthUser: TrustedAiContext = {
    actorId: 'usr_doc_001',
    tenantId: 'tenant_clinica_alpha',
    roles: ['Physiotherapist'],
    permissions: ['ai:read', 'ai:write'],
    email: 'doc@clinica-alpha.com',
  };

  const sampleCitationDetailDto = {
    id: 'cite_123',
    messageId: 'msg_456',
    turnId: 'turn_789',
    conversationId: 'conv_101',
    documentId: 'doc_202',
    documentTitleSnapshot: 'Manual de Kinesiología y Rehabilitación',
    documentTitle: 'Manual de Kinesiología y Rehabilitación',
    originalFileName: 'manual-kinesiologia-v1.pdf',
    documentStatus: 'ACTIVE',
    documentVersionId: 'dver_303',
    documentVersionNumber: 1,
    chunkId: 'chunk_404',
    citationPosition: 1,
    excerpt: 'La tracción cervical mecánica debe iniciarse a bajas cargas.',
    pageNumber: 22,
    headingPath: ['Capítulo 3', 'Tracción Mecánica'],
    relevanceScore: 0.942,
    retrievalRank: 1,
    sourceStrategy: 'HYBRID',
    previewStatus: 'DOCUMENT_AVAILABLE' as const,
    canPreview: true,
    previewUnavailableReason: null,
    mimeType: 'application/pdf',
    fileSizeBytes: 1048576,
    createdAt: '2026-11-24T18:00:00.000Z',
  };

  beforeEach(async () => {
    getCitationsUseCase = {
      execute: jest.fn().mockResolvedValue({
        conversationId: 'conv_101',
        messageId: 'msg_456',
        citations: [sampleCitationDetailDto],
        totalCitations: 1,
      }),
    } as unknown as jest.Mocked<GetMessageCitationsUseCase>;

    getCitationDetailUseCase = {
      execute: jest.fn().mockResolvedValue({
        citation: sampleCitationDetailDto,
      }),
    } as unknown as jest.Mocked<GetCitationDetailUseCase>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiConversationController],
      providers: [
        { provide: CreateConversationWithInitialTurnUseCase, useValue: {} },
        { provide: ReserveConversationTurnUseCase, useValue: {} },
        { provide: GetConversationUseCase, useValue: {} },
        { provide: ListConversationsUseCase, useValue: {} },
        { provide: GetMessageHistoryUseCase, useValue: {} },
        { provide: UpdateConversationTitleUseCase, useValue: {} },
        { provide: ArchiveConversationUseCase, useValue: {} },
        { provide: PrivilegedInspectConversationUseCase, useValue: {} },
        { provide: CancelConversationTurnUseCase, useValue: {} },
        { provide: GetMessageCitationsUseCase, useValue: getCitationsUseCase },
        { provide: GetCitationDetailUseCase, useValue: getCitationDetailUseCase },
      ],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AiConversationController>(AiConversationController);
  });

  describe('GET :conversationId/messages/:messageId/citations', () => {
    it('1. successfully delegates to GetMessageCitationsUseCase with trusted auth context', async () => {
      const response = await controller.getMessageCitations(mockAuthUser, 'conv_101', 'msg_456');

      expect(getCitationsUseCase.execute).toHaveBeenCalledWith({
        tenantId: mockAuthUser.tenantId,
        userId: mockAuthUser.actorId,
        conversationId: 'conv_101',
        messageId: 'msg_456',
        userRoles: mockAuthUser.roles,
      });

      expect(response.conversationId).toBe('conv_101');
      expect(response.messageId).toBe('msg_456');
      expect(response.citations).toHaveLength(1);
      expect(response.citations[0]?.id).toBe('cite_123');
      expect(response.citations[0]?.previewStatus).toBe('DOCUMENT_AVAILABLE');
      expect(response.citations[0]?.canPreview).toBe(true);
      expect(response.citations[0]?.excerpt).toBe(sampleCitationDetailDto.excerpt);
    });

    it('2. propagates ConversationNotFoundError when conversation is missing', async () => {
      getCitationsUseCase.execute.mockRejectedValueOnce(
        new ConversationNotFoundError('conv_missing', mockAuthUser.tenantId),
      );

      await expect(
        controller.getMessageCitations(mockAuthUser, 'conv_missing', 'msg_456'),
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it('3. propagates MessageNotFoundError when message is missing', async () => {
      getCitationsUseCase.execute.mockRejectedValueOnce(
        new MessageNotFoundError('msg_missing', undefined, 'conv_101'),
      );

      await expect(
        controller.getMessageCitations(mockAuthUser, 'conv_101', 'msg_missing'),
      ).rejects.toThrow(MessageNotFoundError);
    });
  });

  describe('GET :conversationId/messages/:messageId/citations/:citationId', () => {
    it('4. successfully delegates to GetCitationDetailUseCase and returns citation detail', async () => {
      const response = await controller.getCitationDetail(
        mockAuthUser,
        'conv_101',
        'msg_456',
        'cite_123',
      );

      expect(getCitationDetailUseCase.execute).toHaveBeenCalledWith({
        tenantId: mockAuthUser.tenantId,
        userId: mockAuthUser.actorId,
        conversationId: 'conv_101',
        messageId: 'msg_456',
        citationId: 'cite_123',
        userRoles: mockAuthUser.roles,
      });

      expect(response.id).toBe('cite_123');
      expect(response.citationPosition).toBe(1);
      expect(response.documentTitleSnapshot).toBe('Manual de Kinesiología y Rehabilitación');
      expect(response.previewStatus).toBe('DOCUMENT_AVAILABLE');
      expect(response.canPreview).toBe(true);
      expect(response.pageNumber).toBe(22);
    });

    it('5. propagates CitationNotFoundError when citation is not found', async () => {
      getCitationDetailUseCase.execute.mockRejectedValueOnce(
        new CitationNotFoundError('cite_missing', 'msg_456', 'conv_101'),
      );

      await expect(
        controller.getCitationDetail(mockAuthUser, 'conv_101', 'msg_456', 'cite_missing'),
      ).rejects.toThrow(CitationNotFoundError);
    });
  });
});
