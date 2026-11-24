import { Test, TestingModule } from '@nestjs/testing';
import { AiConversationController } from '../ai-conversation.controller';
import { AiConversationModule } from '../ai-conversation.module';
import { PrismaService } from '../../../platform/persistence/prisma/prisma.service';
import {
  CreateConversationWithInitialTurnUseCase,
  ReserveConversationTurnUseCase,
  GetConversationUseCase,
  ListConversationsUseCase,
  GetMessageHistoryUseCase,
  UpdateConversationTitleUseCase,
  ArchiveConversationUseCase,
  PersistMessageStateUseCase,
  CancelConversationTurnUseCase,
  TurnStatus,
  ConversationRole,
  GenerationStatus,
} from '@kinergy-platform/core';
import { AuthenticationGuard } from '../../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../../platform/identity/authorization/authorization.guard';
import { TrustedAiContext } from '../decorators/trusted-ai-context.decorator';

describe('AI-09.3-BE.05.01 — AiConversationModule & Controller DI Verification', () => {
  let module: TestingModule;
  let controller: AiConversationController;
  let mockPrisma: unknown;

  const mockTrustedContext: TrustedAiContext = {
    actorId: 'usr_test_123',
    tenantId: 'tnt_test_123',
    roles: ['Doctor'],
    permissions: ['ai.conversations.audit'],
    email: 'doctor@kinergy.com',
  };

  beforeAll(async () => {
    mockPrisma = {
      $transaction: jest.fn(),
      aiConversation: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      aiConversationTurn: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      aiConversationMessage: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
      },
      aiConversationAuditLog: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };

    module = await Test.createTestingModule({
      imports: [AiConversationModule],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(PrismaService)
      .useValue(mockPrisma)
      .compile();

    controller = module.get<AiConversationController>(AiConversationController);
  });

  it('1. successfully resolves AiConversationController and all 8 use-case dependencies via DI', () => {
    expect(controller).toBeDefined();
    expect(module.get(CreateConversationWithInitialTurnUseCase)).toBeDefined();
    expect(module.get(ReserveConversationTurnUseCase)).toBeDefined();
    expect(module.get(GetConversationUseCase)).toBeDefined();
    expect(module.get(ListConversationsUseCase)).toBeDefined();
    expect(module.get(GetMessageHistoryUseCase)).toBeDefined();
    expect(module.get(UpdateConversationTitleUseCase)).toBeDefined();
    expect(module.get(ArchiveConversationUseCase)).toBeDefined();
    expect(module.get(PersistMessageStateUseCase)).toBeDefined();
    expect(module.get(CancelConversationTurnUseCase)).toBeDefined();
  });

  it('1b. createConversation invokes CreateConversationWithInitialTurnUseCase with trusted context', async () => {
    const createUseCase = module.get<CreateConversationWithInitialTurnUseCase>(
      CreateConversationWithInitialTurnUseCase,
    );
    jest.spyOn(createUseCase, 'execute').mockResolvedValueOnce({
      conversationId: 'conv_created_1',
      turnId: 'turn_1',
      clientTurnId: 'client_turn_99',
      turnIndex: 1,
      userMessageId: 'msg_u_1',
      assistantAttemptId: 'msg_a_1',
      title: 'Aerobic Threshold Assessment',
      turnStatus: TurnStatus.PENDING,
      isIdempotentReplay: false,
      idempotencyOutcome: 'CREATED',
      createdAt: '2026-11-23T12:00:00.000Z',
    });

    const response = await controller.createConversation(mockTrustedContext, {
      clientTurnId: 'client_turn_99',
      userPrompt: 'Assess aerobic threshold metrics',
      title: 'Aerobic Threshold Assessment',
      metadata: { source: 'clinical' },
    });

    expect(createUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: mockTrustedContext.tenantId,
        userId: mockTrustedContext.actorId,
        clientTurnId: 'client_turn_99',
        userPrompt: 'Assess aerobic threshold metrics',
        title: 'Aerobic Threshold Assessment',
        metadata: { source: 'clinical' },
      }),
    );

    expect(response.conversationId).toBe('conv_created_1');
    expect(response.clientTurnId).toBe('client_turn_99');
    expect(response.turnStatus).toBe(TurnStatus.PENDING);
    expect(response.isIdempotentReplay).toBe(false);
  });

  it('1c. reserveTurn invokes ReserveConversationTurnUseCase with trusted context', async () => {
    const reserveUseCase = module.get<ReserveConversationTurnUseCase>(
      ReserveConversationTurnUseCase,
    );
    jest.spyOn(reserveUseCase, 'execute').mockResolvedValueOnce({
      conversationId: 'conv_created_1',
      turnId: 'turn_2',
      clientTurnId: 'client_turn_100',
      turnIndex: 2,
      userMessageId: 'msg_u_2',
      assistantAttemptId: 'msg_a_2',
      turnStatus: TurnStatus.PENDING,
      isIdempotentReplay: false,
      idempotencyOutcome: 'CREATED',
      createdAt: '2026-11-23T12:05:00.000Z',
    });

    const response = await controller.reserveTurn(mockTrustedContext, 'conv_created_1', {
      clientTurnId: 'client_turn_100',
      userPrompt: 'Subsequent prompt',
    });

    expect(reserveUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: mockTrustedContext.tenantId,
        userId: mockTrustedContext.actorId,
        conversationId: 'conv_created_1',
        clientTurnId: 'client_turn_100',
        userPrompt: 'Subsequent prompt',
        metadata: undefined,
      }),
    );

    expect(response.conversationId).toBe('conv_created_1');
    expect(response.turnId).toBe('turn_2');
    expect(response.turnIndex).toBe(2);
  });

  it('2. listConversations invokes ListConversationsUseCase with trusted tenant and actor context', async () => {
    const listUseCase = module.get<ListConversationsUseCase>(ListConversationsUseCase);
    jest.spyOn(listUseCase, 'execute').mockResolvedValueOnce({
      items: [
        {
          id: 'conv_1',
          title: 'Cardio Protocol',
          turnCounter: 2,
          lastActivityAt: '2026-11-23T12:00:00.000Z',
          createdAt: '2026-11-23T10:00:00.000Z',
          isArchived: false,
        },
      ],
      nextCursor: 'next_cursor_1',
      hasMore: false,
    });

    const response = await controller.listConversations(mockTrustedContext, {
      limit: 10,
      includeArchived: false,
    });

    expect(listUseCase.execute).toHaveBeenCalledWith({
      tenantId: mockTrustedContext.tenantId,
      userId: mockTrustedContext.actorId,
      cursor: undefined,
      limit: 10,
      includeArchived: false,
    });

    expect(response.items).toHaveLength(1);
    expect(response.items[0]?.id).toBe('conv_1');
    expect(response.nextCursor).toBe('next_cursor_1');
    expect(response.hasMore).toBe(false);
  });

  it('3. getConversation invokes GetConversationUseCase with trusted tenantId', async () => {
    const getUseCase = module.get<GetConversationUseCase>(GetConversationUseCase);
    jest.spyOn(getUseCase, 'execute').mockResolvedValueOnce({
      id: 'conv_1',
      tenantId: mockTrustedContext.tenantId,
      userId: mockTrustedContext.actorId,
      title: 'VO2 Max Session',
      turnCounter: 1,
      messageCounter: 2,
      lastActivityAt: '2026-11-23T12:00:00.000Z',
      createdAt: '2026-11-23T10:00:00.000Z',
      updatedAt: '2026-11-23T12:00:00.000Z',
      isArchived: false,
      activeTurnId: 'turn_active_1',
      turns: [
        {
          id: 'turn_1',
          turnIndex: 1,
          status: TurnStatus.PENDING,
          clientTurnId: 'client_abc',
          activeAttemptId: 'msg_asst_1',
          activeAttemptNumber: 1,
          createdAt: '2026-11-23T10:00:00.000Z',
          completedAt: null,
        },
      ],
    });

    const detail = await controller.getConversation(mockTrustedContext, 'conv_1');

    expect(getUseCase.execute).toHaveBeenCalledWith({
      tenantId: mockTrustedContext.tenantId,
      conversationId: 'conv_1',
      includeTurns: true,
    });

    expect(detail.id).toBe('conv_1');
    expect(detail.turns).toHaveLength(1);
    expect(detail.activeTurnId).toBe('turn_active_1');
  });

  it('4. getMessageHistory invokes GetMessageHistoryUseCase with sequence ordering', async () => {
    const historyUseCase = module.get<GetMessageHistoryUseCase>(GetMessageHistoryUseCase);
    jest.spyOn(historyUseCase, 'execute').mockResolvedValueOnce({
      messages: [
        {
          id: 'msg_1',
          turnId: 'turn_1',
          role: ConversationRole.USER,
          sequenceNumber: 1,
          attemptNumber: 1,
          isCanonical: false,
          status: GenerationStatus.SUCCESS,
          content: 'Hello doctor',
          sources: null,
          metadata: null,
          createdAt: '2026-11-23T10:00:00.000Z',
          completedAt: null,
        },
      ],
      nextCursor: null,
      hasMore: false,
    });

    const response = await controller.getMessageHistory(mockTrustedContext, 'conv_1', {
      limit: 20,
    });

    expect(historyUseCase.execute).toHaveBeenCalledWith({
      tenantId: mockTrustedContext.tenantId,
      conversationId: 'conv_1',
      cursor: undefined,
      limit: 20,
    });

    expect(response.messages).toHaveLength(1);
    expect(response.messages[0]?.role).toBe(ConversationRole.USER);
  });

  it('5. updateTitle invokes UpdateConversationTitleUseCase with validated title', async () => {
    const updateTitleUseCase = module.get<UpdateConversationTitleUseCase>(
      UpdateConversationTitleUseCase,
    );
    jest.spyOn(updateTitleUseCase, 'execute').mockResolvedValueOnce({
      conversationId: 'conv_1',
      title: 'Renamed Session',
      updatedAt: '2026-11-23T14:00:00.000Z',
    });

    const response = await controller.updateTitle(mockTrustedContext, 'conv_1', {
      title: 'Renamed Session',
    });

    expect(updateTitleUseCase.execute).toHaveBeenCalledWith({
      tenantId: mockTrustedContext.tenantId,
      conversationId: 'conv_1',
      title: 'Renamed Session',
    });

    expect(response.title).toBe('Renamed Session');
  });

  it('6. archiveConversation invokes ArchiveConversationUseCase with tenant isolation', async () => {
    const archiveUseCase = module.get<ArchiveConversationUseCase>(ArchiveConversationUseCase);
    jest.spyOn(archiveUseCase, 'execute').mockResolvedValueOnce({
      conversationId: 'conv_1',
      isArchived: true,
      archivedAt: '2026-11-23T15:00:00.000Z',
    });

    const response = await controller.archiveConversation(mockTrustedContext, 'conv_1');

    expect(archiveUseCase.execute).toHaveBeenCalledWith({
      tenantId: mockTrustedContext.tenantId,
      conversationId: 'conv_1',
    });

    expect(response.isArchived).toBe(true);
  });
});
