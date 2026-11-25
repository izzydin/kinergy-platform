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
  TurnStatus,
  ConversationRole,
  GenerationStatus,
  ConversationNotFoundError,
  DuplicateClientTurnPayloadMismatchError,
  TenantOwnershipViolationError,
  TurnAlreadyInProgressError,
} from '@kinergy-platform/core';
import { TrustedAiContext } from '../decorators/trusted-ai-context.decorator';
import {
  CreateConversationRequestDto,
  ReserveTurnRequestDto,
  UpdateConversationTitleRequestDto,
} from '../dtos/ai-conversation.dtos';

describe('AI-09.3-BE.05.03 — AiConversationController Unit Tests', () => {
  let controller: AiConversationController;
  let createUseCase: jest.Mocked<CreateConversationWithInitialTurnUseCase>;
  let reserveTurnUseCase: jest.Mocked<ReserveConversationTurnUseCase>;
  let getUseCase: jest.Mocked<GetConversationUseCase>;
  let listUseCase: jest.Mocked<ListConversationsUseCase>;
  let getHistoryUseCase: jest.Mocked<GetMessageHistoryUseCase>;
  let updateTitleUseCase: jest.Mocked<UpdateConversationTitleUseCase>;
  let archiveUseCase: jest.Mocked<ArchiveConversationUseCase>;
  let inspectUseCase: jest.Mocked<PrivilegedInspectConversationUseCase>;
  let cancelTurnUseCase: jest.Mocked<CancelConversationTurnUseCase>;

  const mockAuthUser: TrustedAiContext = {
    actorId: 'usr_doc_001',
    tenantId: 'tenant_clinica_alpha',
    roles: ['Physiotherapist'],
    permissions: ['ai:read', 'ai:write'],
    email: 'doc@clinica-alpha.com',
  };

  beforeEach(async () => {
    createUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateConversationWithInitialTurnUseCase>;

    reserveTurnUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ReserveConversationTurnUseCase>;

    getUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetConversationUseCase>;

    listUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ListConversationsUseCase>;

    getHistoryUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<GetMessageHistoryUseCase>;

    updateTitleUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateConversationTitleUseCase>;

    archiveUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ArchiveConversationUseCase>;

    inspectUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<PrivilegedInspectConversationUseCase>;

    cancelTurnUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CancelConversationTurnUseCase>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiConversationController],
      providers: [
        { provide: CreateConversationWithInitialTurnUseCase, useValue: createUseCase },
        { provide: ReserveConversationTurnUseCase, useValue: reserveTurnUseCase },
        { provide: GetConversationUseCase, useValue: getUseCase },
        { provide: ListConversationsUseCase, useValue: listUseCase },
        { provide: GetMessageHistoryUseCase, useValue: getHistoryUseCase },
        { provide: UpdateConversationTitleUseCase, useValue: updateTitleUseCase },
        { provide: ArchiveConversationUseCase, useValue: archiveUseCase },
        { provide: PrivilegedInspectConversationUseCase, useValue: inspectUseCase },
        { provide: CancelConversationTurnUseCase, useValue: cancelTurnUseCase },
      ],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AiConversationController>(AiConversationController);
  });

  // ==========================================
  // 1. Create Conversation Endpoint
  // ==========================================
  describe('POST /api/v1/ai/conversations', () => {
    it('1. creates a new conversation and initial turn with trusted principal context', async () => {
      const requestDto: CreateConversationRequestDto = {
        clientTurnId: 'turn_client_123',
        userPrompt: 'Recommend an eccentric quadriceps loading protocol',
        title: 'Quadriceps Protocol',
        metadata: { referral: 'orthopedic_clinic' },
      };

      createUseCase.execute.mockResolvedValueOnce({
        conversationId: 'conv_alpha_1',
        turnId: 'turn_alpha_1',
        clientTurnId: 'turn_client_123',
        turnIndex: 1,
        userMessageId: 'msg_u_1',
        assistantAttemptId: 'msg_a_1',
        title: 'Quadriceps Protocol',
        turnStatus: TurnStatus.PENDING,
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: '2026-11-23T14:00:00.000Z',
      });

      const response = await controller.createConversation(mockAuthUser, requestDto);

      expect(createUseCase.execute).toHaveBeenCalledWith({
        tenantId: mockAuthUser.tenantId,
        userId: mockAuthUser.actorId,
        clientTurnId: requestDto.clientTurnId,
        userPrompt: requestDto.userPrompt,
        title: requestDto.title,
        metadata: requestDto.metadata,
        actorContext: {
          roles: mockAuthUser.roles,
          permissions: mockAuthUser.permissions,
        },
      });

      expect(response.conversationId).toBe('conv_alpha_1');
      expect(response.turnId).toBe('turn_alpha_1');
      expect(response.turnIndex).toBe(1);
      expect(response.isIdempotentReplay).toBe(false);
      expect(response.idempotencyOutcome).toBe('CREATED');
    });

    it('2. recovers an existing turn idempotently when matching clientTurnId is submitted', async () => {
      const requestDto: CreateConversationRequestDto = {
        clientTurnId: 'turn_client_123',
        userPrompt: 'Recommend an eccentric quadriceps loading protocol',
      };

      createUseCase.execute.mockResolvedValueOnce({
        conversationId: 'conv_alpha_1',
        turnId: 'turn_alpha_1',
        clientTurnId: 'turn_client_123',
        turnIndex: 1,
        userMessageId: 'msg_u_1',
        assistantAttemptId: 'msg_a_1',
        title: 'Quadriceps Protocol',
        turnStatus: TurnStatus.PENDING,
        isIdempotentReplay: true,
        idempotencyOutcome: 'EXISTING_RECOVERED',
        createdAt: '2026-11-23T14:00:00.000Z',
      });

      const response = await controller.createConversation(mockAuthUser, requestDto);

      expect(response.isIdempotentReplay).toBe(true);
      expect(response.idempotencyOutcome).toBe('EXISTING_RECOVERED');
      expect(response.conversationId).toBe('conv_alpha_1');
    });

    it('3. bubbles DuplicateClientTurnPayloadMismatchError on conflicting idempotency payload', async () => {
      const requestDto: CreateConversationRequestDto = {
        clientTurnId: 'turn_client_123',
        userPrompt: 'Completely different prompt with reused turn ID',
      };

      createUseCase.execute.mockRejectedValueOnce(
        new DuplicateClientTurnPayloadMismatchError('turn_client_123', 'hash_orig', 'hash_new'),
      );

      await expect(controller.createConversation(mockAuthUser, requestDto)).rejects.toThrow(
        DuplicateClientTurnPayloadMismatchError,
      );
    });

    it('4. ensures no internal fields (payloadHash, leaseToken, txId) leak in response', async () => {
      createUseCase.execute.mockResolvedValueOnce({
        conversationId: 'conv_alpha_1',
        turnId: 'turn_alpha_1',
        clientTurnId: 'turn_client_123',
        turnIndex: 1,
        userMessageId: 'msg_u_1',
        assistantAttemptId: 'msg_a_1',
        title: 'Quadriceps Protocol',
        turnStatus: TurnStatus.PENDING,
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: '2026-11-23T14:00:00.000Z',
      });

      const response = await controller.createConversation(mockAuthUser, {
        clientTurnId: 'turn_client_123',
        userPrompt: 'Protocol query',
      });

      const raw = response as unknown as Record<string, unknown>;
      expect(raw['payloadHash']).toBeUndefined();
      expect(raw['idempotencyPayloadHash']).toBeUndefined();
      expect(raw['leaseToken']).toBeUndefined();
      expect(raw['txId']).toBeUndefined();
    });
  });

  // ==========================================
  // 1b. Reserve Subsequent Turn Endpoint
  // ==========================================
  describe('POST /api/v1/ai/conversations/:id/turns', () => {
    it('1. reserves subsequent conversation turn with single-generation atomicity', async () => {
      const requestDto: ReserveTurnRequestDto = {
        clientTurnId: 'turn_client_02',
        userPrompt: 'Specify loading parameters for patellar tendinopathy',
        metadata: { source: 'rehab_tracker' },
      };

      reserveTurnUseCase.execute.mockResolvedValueOnce({
        conversationId: 'conv_alpha_1',
        turnId: 'turn_alpha_2',
        clientTurnId: 'turn_client_02',
        turnIndex: 2,
        userMessageId: 'msg_u_2',
        assistantAttemptId: 'msg_a_2',
        turnStatus: TurnStatus.PENDING,
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: '2026-11-23T14:10:00.000Z',
      });

      const response = await controller.reserveTurn(mockAuthUser, 'conv_alpha_1', requestDto);

      expect(reserveTurnUseCase.execute).toHaveBeenCalledWith({
        tenantId: mockAuthUser.tenantId,
        userId: mockAuthUser.actorId,
        conversationId: 'conv_alpha_1',
        clientTurnId: requestDto.clientTurnId,
        userPrompt: requestDto.userPrompt,
        metadata: requestDto.metadata,
        actorContext: {
          roles: mockAuthUser.roles,
          permissions: mockAuthUser.permissions,
        },
      });

      expect(response.conversationId).toBe('conv_alpha_1');
      expect(response.turnId).toBe('turn_alpha_2');
      expect(response.turnIndex).toBe(2);
      expect(response.turnStatus).toBe(TurnStatus.PENDING);
      expect(response.isIdempotentReplay).toBe(false);
      expect(response.idempotencyOutcome).toBe('CREATED');
    });

    it('2. recovers matching subsequent turn idempotently when retried', async () => {
      const requestDto: ReserveTurnRequestDto = {
        clientTurnId: 'turn_client_02',
        userPrompt: 'Specify loading parameters for patellar tendinopathy',
      };

      reserveTurnUseCase.execute.mockResolvedValueOnce({
        conversationId: 'conv_alpha_1',
        turnId: 'turn_alpha_2',
        clientTurnId: 'turn_client_02',
        turnIndex: 2,
        userMessageId: 'msg_u_2',
        assistantAttemptId: 'msg_a_2',
        turnStatus: TurnStatus.PENDING,
        isIdempotentReplay: true,
        idempotencyOutcome: 'EXISTING_RECOVERED',
        createdAt: '2026-11-23T14:10:00.000Z',
      });

      const response = await controller.reserveTurn(mockAuthUser, 'conv_alpha_1', requestDto);

      expect(response.isIdempotentReplay).toBe(true);
      expect(response.idempotencyOutcome).toBe('EXISTING_RECOVERED');
    });

    it('3. rejects turn reservation with TurnAlreadyInProgressError when active generation exists', async () => {
      reserveTurnUseCase.execute.mockRejectedValueOnce(
        new TurnAlreadyInProgressError('conv_alpha_1', 'turn_active_1'),
      );

      await expect(
        controller.reserveTurn(mockAuthUser, 'conv_alpha_1', {
          clientTurnId: 'turn_competing',
          userPrompt: 'Competing generation request',
        }),
      ).rejects.toThrow(TurnAlreadyInProgressError);
    });

    it('4. rejects turn reservation with DuplicateClientTurnPayloadMismatchError on payload conflict', async () => {
      reserveTurnUseCase.execute.mockRejectedValueOnce(
        new DuplicateClientTurnPayloadMismatchError('turn_client_02', 'hash_orig', 'hash_conflict'),
      );

      await expect(
        controller.reserveTurn(mockAuthUser, 'conv_alpha_1', {
          clientTurnId: 'turn_client_02',
          userPrompt: 'Conflicting prompt string',
        }),
      ).rejects.toThrow(DuplicateClientTurnPayloadMismatchError);
    });

    it('5. rejects cross-tenant turn reservation when conversation does not belong to tenant', async () => {
      reserveTurnUseCase.execute.mockRejectedValueOnce(
        new ConversationNotFoundError('conv_foreign', mockAuthUser.tenantId),
      );

      await expect(
        controller.reserveTurn(mockAuthUser, 'conv_foreign', {
          clientTurnId: 'turn_client_x',
          userPrompt: 'Attempt access to other tenant',
        }),
      ).rejects.toThrow(ConversationNotFoundError);
    });
  });

  // ==========================================
  // 2. List Conversations Endpoint
  // ==========================================
  describe('GET /api/v1/ai/conversations', () => {
    it('1. invokes ListConversationsUseCase strictly scoped to the authenticated tenant and user', async () => {
      listUseCase.execute.mockResolvedValueOnce({
        items: [
          {
            id: 'conv_1',
            title: 'Kinesio Taping Guidelines',
            turnCounter: 4,
            lastActivityAt: '2026-11-23T15:00:00.000Z',
            createdAt: '2026-11-23T12:00:00.000Z',
            isArchived: false,
          },
        ],
        nextCursor: 'next_page_token',
        hasMore: true,
      });

      const response = await controller.listConversations(mockAuthUser, {
        limit: 10,
        includeArchived: false,
      });

      expect(listUseCase.execute).toHaveBeenCalledWith({
        tenantId: mockAuthUser.tenantId,
        userId: mockAuthUser.actorId,
        cursor: undefined,
        limit: 10,
        includeArchived: false,
      });

      expect(response.items).toHaveLength(1);
      expect(response.items[0]?.title).toBe('Kinesio Taping Guidelines');
      expect(response.nextCursor).toBe('next_page_token');
      expect(response.hasMore).toBe(true);
    });
  });

  // ==========================================
  // 3. Get Conversation Endpoint
  // ==========================================
  describe('GET /api/v1/ai/conversations/:id', () => {
    it('1. retrieves conversation details and child turns within tenant', async () => {
      getUseCase.execute.mockResolvedValueOnce({
        id: 'conv_1',
        tenantId: mockAuthUser.tenantId,
        userId: mockAuthUser.actorId,
        title: 'Rehabilitation Progression',
        turnCounter: 1,
        messageCounter: 2,
        lastActivityAt: '2026-11-23T15:00:00.000Z',
        createdAt: '2026-11-23T14:00:00.000Z',
        updatedAt: '2026-11-23T15:00:00.000Z',
        isArchived: false,
        activeTurnId: null,
        turns: [
          {
            id: 'turn_1',
            turnIndex: 1,
            status: TurnStatus.COMPLETED,
            clientTurnId: 'client_1',
            activeAttemptId: 'att_1',
            activeAttemptNumber: 1,
            createdAt: '2026-11-23T14:00:00.000Z',
            completedAt: '2026-11-23T14:01:00.000Z',
          },
        ],
      });

      const response = await controller.getConversation(mockAuthUser, 'conv_1');

      expect(getUseCase.execute).toHaveBeenCalledWith({
        tenantId: mockAuthUser.tenantId,
        conversationId: 'conv_1',
        includeTurns: true,
      });

      expect(response.id).toBe('conv_1');
      expect(response.turns).toHaveLength(1);

      // Verify tenantId and userId are excluded from public representation
      const raw = response as unknown as Record<string, unknown>;
      expect(raw['tenantId']).toBeUndefined();
      expect(raw['userId']).toBeUndefined();
    });

    it('2. throws ConversationNotFoundError when conversation does not exist in tenant', async () => {
      getUseCase.execute.mockRejectedValueOnce(
        new ConversationNotFoundError('conv_missing', mockAuthUser.tenantId),
      );

      await expect(controller.getConversation(mockAuthUser, 'conv_missing')).rejects.toThrow(
        ConversationNotFoundError,
      );
    });

    it('3. rejects cross-tenant access with TenantOwnershipViolationError', async () => {
      getUseCase.execute.mockRejectedValueOnce(
        new TenantOwnershipViolationError(
          'conv_other_tenant',
          mockAuthUser.tenantId,
          'tenant_foreign',
        ),
      );

      await expect(controller.getConversation(mockAuthUser, 'conv_other_tenant')).rejects.toThrow(
        TenantOwnershipViolationError,
      );
    });
  });

  // ==========================================
  // 3b. Get Message History Endpoint
  // ==========================================
  describe('GET /api/v1/ai/conversations/:id/messages', () => {
    it('1. retrieves message history ordered by sequence ASC with keyset cursor', async () => {
      getHistoryUseCase.execute.mockResolvedValueOnce({
        messages: [
          {
            id: 'msg_u_1',
            turnId: 'turn_1',
            role: ConversationRole.USER,
            sequenceNumber: 1,
            attemptNumber: 1,
            isCanonical: true,
            status: GenerationStatus.SUCCESS,
            content: 'How should eccentric training be prescribed?',
            sources: null,
            metadata: null,
            createdAt: '2026-11-23T14:00:00.000Z',
            completedAt: '2026-11-23T14:00:00.000Z',
          },
          {
            id: 'msg_a_1',
            turnId: 'turn_1',
            role: ConversationRole.ASSISTANT,
            sequenceNumber: 2,
            attemptNumber: 1,
            isCanonical: true,
            status: GenerationStatus.SUCCESS,
            content: 'Eccentric training should start with submaximal loads...',
            sources: [{ documentId: 'doc_1', chunkId: 'chk_1' }],
            metadata: null,
            createdAt: '2026-11-23T14:00:05.000Z',
            completedAt: '2026-11-23T14:00:10.000Z',
          },
        ],
        nextCursor: 'next_msg_cursor',
        hasMore: true,
      });

      const response = await controller.getMessageHistory(mockAuthUser, 'conv_1', {
        cursor: 'curr_cursor',
        limit: 10,
      });

      expect(getHistoryUseCase.execute).toHaveBeenCalledWith({
        tenantId: mockAuthUser.tenantId,
        conversationId: 'conv_1',
        cursor: 'curr_cursor',
        limit: 10,
      });

      expect(response.messages).toHaveLength(2);
      expect(response.messages[0]?.sequenceNumber).toBe(1);
      expect(response.messages[1]?.sequenceNumber).toBe(2);
      expect(response.nextCursor).toBe('next_msg_cursor');
      expect(response.hasMore).toBe(true);
    });

    it('2. throws ConversationNotFoundError when conversation does not exist for message history', async () => {
      getHistoryUseCase.execute.mockRejectedValueOnce(
        new ConversationNotFoundError('conv_missing', mockAuthUser.tenantId),
      );

      await expect(
        controller.getMessageHistory(mockAuthUser, 'conv_missing', { limit: 10 }),
      ).rejects.toThrow(ConversationNotFoundError);
    });
  });

  // ==========================================
  // 4. Update Conversation Title Endpoint
  // ==========================================
  describe('PATCH /api/v1/ai/conversations/:id/title', () => {
    it('1. updates conversation title with tenant scoping', async () => {
      const updateDto: UpdateConversationTitleRequestDto = {
        title: 'Patellar Tendinopathy Plan',
      };

      updateTitleUseCase.execute.mockResolvedValueOnce({
        conversationId: 'conv_1',
        title: 'Patellar Tendinopathy Plan',
        updatedAt: '2026-11-23T15:30:00.000Z',
      });

      const response = await controller.updateTitle(mockAuthUser, 'conv_1', updateDto);

      expect(updateTitleUseCase.execute).toHaveBeenCalledWith({
        tenantId: mockAuthUser.tenantId,
        conversationId: 'conv_1',
        title: updateDto.title,
      });

      expect(response.conversationId).toBe('conv_1');
      expect(response.title).toBe('Patellar Tendinopathy Plan');
    });
  });

  // ==========================================
  // 5. Archive Conversation Endpoint
  // ==========================================
  describe('DELETE /api/v1/ai/conversations/:id', () => {
    it('1. archives conversation successfully', async () => {
      archiveUseCase.execute.mockResolvedValueOnce({
        conversationId: 'conv_1',
        isArchived: true,
        archivedAt: '2026-11-23T15:45:00.000Z',
      });

      const response = await controller.archiveConversation(mockAuthUser, 'conv_1');

      expect(archiveUseCase.execute).toHaveBeenCalledWith({
        tenantId: mockAuthUser.tenantId,
        conversationId: 'conv_1',
      });

      expect(response.conversationId).toBe('conv_1');
      expect(response.isArchived).toBe(true);
    });

    it('2. rejects archiving when turn generation is actively in progress', async () => {
      archiveUseCase.execute.mockRejectedValueOnce(
        new TurnAlreadyInProgressError('conv_1', 'turn_active'),
      );

      await expect(controller.archiveConversation(mockAuthUser, 'conv_1')).rejects.toThrow(
        TurnAlreadyInProgressError,
      );
    });
  });

  // ==========================================
  // 6. Privileged Audit Inspection Endpoint
  // ==========================================
  describe('POST /api/v1/ai/conversations/:id/audit-inspect', () => {
    const ownerAuthUser: TrustedAiContext = {
      actorId: 'usr_owner_001',
      tenantId: 'tenant_clinica_alpha',
      roles: ['Owner'],
      permissions: ['ai.conversations.audit'],
      email: 'owner@clinica-alpha.com',
    };

    it('1. allows authorized Owner to inspect conversation with justification reason', async () => {
      inspectUseCase.execute.mockResolvedValueOnce({
        auditLogId: 'audit_log_999',
        conversation: {
          id: 'conv_1',
          tenantId: 'tenant_clinica_alpha',
          userId: 'usr_doc_001',
          title: 'Quadriceps Protocol',
          turnCounter: 1,
          messageCounter: 2,
          lastActivityAt: '2026-11-23T15:00:00.000Z',
          createdAt: '2026-11-23T14:00:00.000Z',
          updatedAt: '2026-11-23T15:00:00.000Z',
          isArchived: false,
          activeTurnId: null,
        },
        messages: [
          {
            id: 'msg_1',
            turnId: 'turn_1',
            role: ConversationRole.USER,
            sequenceNumber: 1,
            attemptNumber: 1,
            isCanonical: true,
            status: GenerationStatus.SUCCESS,
            content: 'User prompt',
            sources: null,
            metadata: null,
            createdAt: '2026-11-23T14:00:00.000Z',
            completedAt: '2026-11-23T14:00:00.000Z',
          },
        ],
        inspectedAt: '2026-11-23T16:00:00.000Z',
      });

      const response = await controller.auditInspect(ownerAuthUser, 'conv_1', {
        reason: 'Clinical supervision audit for case review #101',
      });

      expect(inspectUseCase.execute).toHaveBeenCalledWith({
        tenantId: ownerAuthUser.tenantId,
        conversationId: 'conv_1',
        inspectorUserId: ownerAuthUser.actorId,
        inspectorRole: 'Owner',
        reason: 'Clinical supervision audit for case review #101',
      });

      expect(response.auditLogId).toBe('audit_log_999');
      expect(response.conversation.id).toBe('conv_1');
      expect(response.messages).toHaveLength(1);
    });

    it('2. fails closed if audit log persistence fails', async () => {
      inspectUseCase.execute.mockRejectedValueOnce(
        new Error('Privileged inspection aborted: failed to persist mandatory audit log.'),
      );

      await expect(
        controller.auditInspect(ownerAuthUser, 'conv_1', {
          reason: 'Clinical supervision audit for case review #101',
        }),
      ).rejects.toThrow('Privileged inspection aborted: failed to persist mandatory audit log.');
    });

    it('3. rejects cross-tenant audit inspection with 404', async () => {
      inspectUseCase.execute.mockRejectedValueOnce(
        new ConversationNotFoundError('conv_foreign', ownerAuthUser.tenantId),
      );

      await expect(
        controller.auditInspect(ownerAuthUser, 'conv_foreign', {
          reason: 'Attempt inspection of other tenant',
        }),
      ).rejects.toThrow(ConversationNotFoundError);
    });
  });

  // ==========================================
  // 9. Cancel Turn Endpoint
  // ==========================================
  describe('POST /api/v1/ai/conversations/:id/turns/:turnId/cancel', () => {
    it('1. delegates turn cancellation to CancelConversationTurnUseCase', async () => {
      cancelTurnUseCase.execute.mockResolvedValueOnce({
        conversationId: 'conv_1',
        turnId: 'turn_1',
        turnStatus: TurnStatus.CANCELLED,
        assistantMessageId: 'msg_asst_1',
        isAlreadyCancelled: false,
        cancelledAt: '2026-11-23T19:00:00.000Z',
      });

      const response = await controller.cancelTurn(mockAuthUser, 'conv_1', 'turn_1', {
        reason: 'User cancelled turn',
      });

      expect(cancelTurnUseCase.execute).toHaveBeenCalledWith({
        tenantId: mockAuthUser.tenantId,
        userId: mockAuthUser.actorId,
        conversationId: 'conv_1',
        turnId: 'turn_1',
        reason: 'User cancelled turn',
      });
      expect(response.turnStatus).toBe(TurnStatus.CANCELLED);
      expect(response.isAlreadyCancelled).toBe(false);
    });

    it('2. delegates message cancellation to CancelConversationTurnUseCase with messageId', async () => {
      cancelTurnUseCase.execute.mockResolvedValueOnce({
        conversationId: 'conv_1',
        turnId: 'turn_1',
        turnStatus: TurnStatus.CANCELLED,
        assistantMessageId: 'msg_asst_1',
        isAlreadyCancelled: false,
        cancelledAt: '2026-11-23T19:00:00.000Z',
      });

      const response = await controller.cancelMessage(mockAuthUser, 'conv_1', 'msg_asst_1', {
        reason: 'User stopped message generation',
      });

      expect(cancelTurnUseCase.execute).toHaveBeenCalledWith({
        tenantId: mockAuthUser.tenantId,
        userId: mockAuthUser.actorId,
        conversationId: 'conv_1',
        messageId: 'msg_asst_1',
        reason: 'User stopped message generation',
      });
      expect(response.turnStatus).toBe(TurnStatus.CANCELLED);
      expect(response.assistantMessageId).toBe('msg_asst_1');
    });

    it('3. delegates active conversation generation cancellation to CancelConversationTurnUseCase', async () => {
      cancelTurnUseCase.execute.mockResolvedValueOnce({
        conversationId: 'conv_1',
        turnId: 'turn_active',
        turnStatus: TurnStatus.CANCELLED,
        assistantMessageId: 'msg_asst_active',
        isAlreadyCancelled: false,
        cancelledAt: '2026-11-23T19:00:00.000Z',
      });

      const response = await controller.cancelActiveGeneration(mockAuthUser, 'conv_1', {
        reason: 'User aborted active conversation generation',
      });

      expect(cancelTurnUseCase.execute).toHaveBeenCalledWith({
        tenantId: mockAuthUser.tenantId,
        userId: mockAuthUser.actorId,
        conversationId: 'conv_1',
        reason: 'User aborted active conversation generation',
      });
      expect(response.turnStatus).toBe(TurnStatus.CANCELLED);
      expect(response.turnId).toBe('turn_active');
    });
  });
});
