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
  RegenerateConversationTurnUseCase,
  ConversationNotFoundError,
  TurnAlreadyInProgressError,
  InvalidConversationLifecycleError,
  TurnStatus,
} from '@kinergy-platform/core';
import { TrustedAiContext } from '../decorators/trusted-ai-context.decorator';

describe('AiConversationController — Regeneration Endpoints Unit Tests (FB.05)', () => {
  let controller: AiConversationController;
  let regenerateUseCase: jest.Mocked<RegenerateConversationTurnUseCase>;

  const mockAuthUser: TrustedAiContext = {
    actorId: 'usr_regen_physio',
    tenantId: 'tenant_regen_test',
    roles: ['Physiotherapist'],
    permissions: ['ai:read', 'ai:write'],
    email: 'physio@kinergy.com',
  };

  beforeEach(async () => {
    regenerateUseCase = {
      execute: jest.fn().mockResolvedValue({
        conversationId: 'conv_regen_101',
        turnId: 'turn_regen_202',
        turnIndex: 1,
        attemptNumber: 2,
        assistantMessageId: 'msg_asst_att2',
        status: TurnStatus.PENDING,
        userPrompt: 'Protocolo de ejercicios para rehabilitación rotuliana',
      }),
    } as unknown as jest.Mocked<RegenerateConversationTurnUseCase>;

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
        { provide: RegenerateConversationTurnUseCase, useValue: regenerateUseCase },
      ],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthorizationGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AiConversationController>(AiConversationController);
  });

  describe('POST /api/v1/ai/conversations/:id/turns/:turnId/regenerate', () => {
    it('regenerates an eligible turn response and returns 200 with new attempt details', async () => {
      const result = await controller.regenerateTurn(
        mockAuthUser,
        'conv_regen_101',
        'turn_regen_202',
        { clientTurnId: 'turn_client_regen_1' },
      );

      expect(regenerateUseCase.execute).toHaveBeenCalledWith({
        tenantId: mockAuthUser.tenantId,
        userId: mockAuthUser.actorId,
        conversationId: 'conv_regen_101',
        turnId: 'turn_regen_202',
        clientTurnId: 'turn_client_regen_1',
        messageId: undefined,
        actorContext: {
          roles: mockAuthUser.roles,
          permissions: mockAuthUser.permissions,
        },
      });

      expect(result).toEqual({
        conversationId: 'conv_regen_101',
        turnId: 'turn_regen_202',
        turnIndex: 1,
        attemptNumber: 2,
        assistantMessageId: 'msg_asst_att2',
        status: 'PENDING',
        userPrompt: 'Protocolo de ejercicios para rehabilitación rotuliana',
      });
    });

    it('propagates TurnAlreadyInProgressError when another generation is currently in-flight', async () => {
      regenerateUseCase.execute.mockRejectedValueOnce(
        new TurnAlreadyInProgressError('conv_regen_101', 'turn_active_999'),
      );

      await expect(
        controller.regenerateTurn(mockAuthUser, 'conv_regen_101', 'turn_regen_202'),
      ).rejects.toThrow(TurnAlreadyInProgressError);
    });

    it('propagates ConversationNotFoundError when conversation does not exist', async () => {
      regenerateUseCase.execute.mockRejectedValueOnce(
        new ConversationNotFoundError('conv_missing', mockAuthUser.tenantId),
      );

      await expect(
        controller.regenerateTurn(mockAuthUser, 'conv_missing', 'turn_regen_202'),
      ).rejects.toThrow(ConversationNotFoundError);
    });
  });

  describe('POST /api/v1/ai/conversations/:id/messages/:messageId/regenerate', () => {
    it('regenerates response given a specific assistant messageId', async () => {
      const result = await controller.regenerateMessage(
        mockAuthUser,
        'conv_regen_101',
        'msg_asst_att1',
        { clientTurnId: 'turn_client_regen_2' },
      );

      expect(regenerateUseCase.execute).toHaveBeenCalledWith({
        tenantId: mockAuthUser.tenantId,
        userId: mockAuthUser.actorId,
        conversationId: 'conv_regen_101',
        messageId: 'msg_asst_att1',
        clientTurnId: 'turn_client_regen_2',
        actorContext: {
          roles: mockAuthUser.roles,
          permissions: mockAuthUser.permissions,
        },
      });

      expect(result.attemptNumber).toBe(2);
      expect(result.assistantMessageId).toBe('msg_asst_att2');
    });

    it('propagates InvalidConversationLifecycleError when message is not the latest assistant response', async () => {
      regenerateUseCase.execute.mockRejectedValueOnce(
        new InvalidConversationLifecycleError(
          'conv_regen_101',
          'Only the latest assistant response in a conversation can be regenerated.',
        ),
      );

      await expect(
        controller.regenerateMessage(mockAuthUser, 'conv_regen_101', 'msg_historical_1'),
      ).rejects.toThrow('Only the latest assistant response in a conversation can be regenerated.');
    });
  });
});
