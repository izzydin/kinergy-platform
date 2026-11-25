import { Test, TestingModule } from '@nestjs/testing';
import { Response } from 'express';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
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
  GetCitationPreviewUseCase,
  GetCitationDocumentStreamUseCase,
  CitationNotFoundError,
  ConversationNotFoundError,
  MessageNotFoundError,
} from '@kinergy-platform/core';
import { PreviewTokenService } from '../../services/preview-token.service';
import { TrustedAiContext } from '../decorators/trusted-ai-context.decorator';

describe('AiConversationController — Citation Endpoints Unit Tests', () => {
  let controller: AiConversationController;
  let getCitationsUseCase: jest.Mocked<GetMessageCitationsUseCase>;
  let getCitationDetailUseCase: jest.Mocked<GetCitationDetailUseCase>;
  let getCitationPreviewUseCase: jest.Mocked<GetCitationPreviewUseCase>;
  let getCitationDocumentStreamUseCase: jest.Mocked<GetCitationDocumentStreamUseCase>;
  let previewTokenService: PreviewTokenService;

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

  const samplePreviewResult = {
    documentId: 'doc_202',
    citationId: 'cite_123',
    messageId: 'msg_456',
    conversationId: 'conv_101',
    documentTitleSnapshot: 'Manual de Kinesiología y Rehabilitación',
    documentTitle: 'Manual de Kinesiología y Rehabilitación',
    originalFileName: 'manual-kinesiologia-v1.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 1048576,
    documentVersionId: 'dver_303',
    documentVersionNumber: 1,
    pageNumber: 22,
    headingPath: ['Capítulo 3', 'Tracción Mecánica'],
    excerpt: 'La tracción cervical mecánica debe iniciarse a bajas cargas.',
    canPreview: true,
    supportedFormat: true,
    previewStatus: 'DOCUMENT_AVAILABLE' as const,
    previewUnavailableReason: null,
    downloadAllowed: true,
  };

  const samplePdfBuffer = Buffer.from('%PDF-1.4 mock binary stream');

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

    getCitationPreviewUseCase = {
      execute: jest.fn().mockResolvedValue({
        preview: samplePreviewResult,
      }),
    } as unknown as jest.Mocked<GetCitationPreviewUseCase>;

    getCitationDocumentStreamUseCase = {
      execute: jest.fn().mockResolvedValue({
        data: samplePdfBuffer,
        mimeType: 'application/pdf',
        fileSize: samplePdfBuffer.length,
        originalFileName: 'manual-kinesiologia-v1.pdf',
        checksum: 'a'.repeat(64),
        pageNumber: 22,
        headingPath: ['Capítulo 3', 'Tracción Mecánica'],
      }),
    } as unknown as jest.Mocked<GetCitationDocumentStreamUseCase>;

    previewTokenService = new PreviewTokenService();

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
        { provide: GetCitationPreviewUseCase, useValue: getCitationPreviewUseCase },
        { provide: GetCitationDocumentStreamUseCase, useValue: getCitationDocumentStreamUseCase },
        { provide: PreviewTokenService, useValue: previewTokenService },
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

  describe('GET :conversationId/messages/:messageId/citations/:citationId/preview', () => {
    it('6. successfully returns preview metadata and creates short-lived preview token', async () => {
      const response = await controller.getCitationPreview(
        mockAuthUser,
        'conv_101',
        'msg_456',
        'cite_123',
      );

      expect(getCitationPreviewUseCase.execute).toHaveBeenCalledWith({
        tenantId: mockAuthUser.tenantId,
        userId: mockAuthUser.actorId,
        conversationId: 'conv_101',
        messageId: 'msg_456',
        citationId: 'cite_123',
        userRoles: mockAuthUser.roles,
      });

      expect(response.canPreview).toBe(true);
      expect(response.supportedFormat).toBe(true);
      expect(response.previewStatus).toBe('DOCUMENT_AVAILABLE');
      expect(response.documentId).toBe('doc_202');
      expect(response.pageNumber).toBe(22);
      expect(response.previewUrl).toBe(
        '/api/v1/ai/conversations/conv_101/messages/msg_456/citations/cite_123/content',
      );
      expect(response.previewToken).toBeDefined();
      expect(typeof response.previewToken).toBe('string');
    });

    it('7. reports supportedFormat false and does not issue preview token for unsupported format', async () => {
      getCitationPreviewUseCase.execute.mockResolvedValueOnce({
        preview: {
          ...samplePreviewResult,
          canPreview: false,
          supportedFormat: false,
          previewStatus: 'UNSUPPORTED_FORMAT',
          previewUnavailableReason: 'Inline preview is not supported for this file format (DOCX).',
        },
      });

      const response = await controller.getCitationPreview(
        mockAuthUser,
        'conv_101',
        'msg_456',
        'cite_123',
      );

      expect(response.canPreview).toBe(false);
      expect(response.supportedFormat).toBe(false);
      expect(response.previewStatus).toBe('UNSUPPORTED_FORMAT');
      expect(response.previewToken).toBeNull();
    });
  });

  describe('GET :conversationId/messages/:messageId/citations/:citationId/content', () => {
    it('8. streams document content with strict security and cache headers when authenticated', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      await controller.getCitationDocumentContent(
        'conv_101',
        'msg_456',
        'cite_123',
        undefined,
        {
          id: mockAuthUser.actorId,
          email: mockAuthUser.email!,
          status: 'ACTIVE',
          roles: [...mockAuthUser.roles],
          permissions: [...mockAuthUser.permissions],
          tenantId: mockAuthUser.tenantId,
        },
        mockRes,
      );

      expect(getCitationDocumentStreamUseCase.execute).toHaveBeenCalledWith({
        tenantId: mockAuthUser.tenantId,
        userId: mockAuthUser.actorId,
        conversationId: 'conv_101',
        messageId: 'msg_456',
        citationId: 'cite_123',
        userRoles: mockAuthUser.roles,
      });

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'private, no-cache, no-store, must-revalidate',
      );
      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringContaining('inline; filename='),
      );
      expect(mockRes.send).toHaveBeenCalledWith(samplePdfBuffer);
    });

    it('9. streams document content with valid query token without Authorization header', async () => {
      const token = previewTokenService.generateToken({
        tenantId: mockAuthUser.tenantId,
        userId: mockAuthUser.actorId,
        conversationId: 'conv_101',
        messageId: 'msg_456',
        citationId: 'cite_123',
        documentId: 'doc_202',
      });

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      await controller.getCitationDocumentContent(
        'conv_101',
        'msg_456',
        'cite_123',
        token,
        null, // No JWT user!
        mockRes,
      );

      expect(getCitationDocumentStreamUseCase.execute).toHaveBeenCalled();
      expect(mockRes.send).toHaveBeenCalledWith(samplePdfBuffer);
    });

    it('10. throws ForbiddenException when query token is expired', async () => {
      const expiredToken = previewTokenService.generateToken(
        {
          tenantId: mockAuthUser.tenantId,
          userId: mockAuthUser.actorId,
          conversationId: 'conv_101',
          messageId: 'msg_456',
          citationId: 'cite_123',
          documentId: 'doc_202',
        },
        -10, // Expired
      );

      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      await expect(
        controller.getCitationDocumentContent(
          'conv_101',
          'msg_456',
          'cite_123',
          expiredToken,
          null,
          mockRes,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('11. throws UnauthorizedException when neither user nor token is provided', async () => {
      const mockRes = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as unknown as Response;

      await expect(
        controller.getCitationDocumentContent(
          'conv_101',
          'msg_456',
          'cite_123',
          undefined,
          null,
          mockRes,
        ),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
