import {
  CancelConversationTurnUseCase,
  CancelConversationTurnInput,
} from '../cancel-conversation-turn.use-case';
import { IAiConversationRepositoryPort } from '../../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationTurnRepositoryPort } from '../../../ports/outbound/ai-conversation-turn-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../../ports/outbound/ai-conversation-message-repository.port';
import { IAiTurnDispatcherPort } from '../../../ports/inbound/ai-turn-dispatcher.port';
import { AiConversation } from '../../../domain/models/ai-conversation.entity';
import { AiConversationTurn } from '../../../domain/models/ai-conversation-turn.entity';
import { AiConversationMessage } from '../../../domain/models/ai-conversation-message.entity';
import { ConversationTitle } from '../../../domain/value-objects/conversation-title.vo';
import { TurnStatus } from '../../../domain/enums/turn-status.enum';
import { GenerationStatus } from '../../../domain/enums/generation-status.enum';
import { MessageId } from '../../../domain/value-objects/message-id.vo';
import {
  InvalidTurnInputError,
  ConversationNotFoundError,
  TurnNotFoundError,
  TenantOwnershipViolationError,
  InvalidConversationLifecycleError,
} from '../../errors/ai-conversation-application.error';

describe('CancelConversationTurnUseCase', () => {
  const TENANT_ID = 'tenant_cancel_test';
  const USER_ID = 'user_cancel_test';
  const OTHER_USER_ID = 'user_intruder';

  let convRepo: jest.Mocked<IAiConversationRepositoryPort>;
  let turnRepo: jest.Mocked<IAiConversationTurnRepositoryPort>;
  let messageRepo: jest.Mocked<IAiConversationMessageRepositoryPort>;
  let dispatcher: jest.Mocked<IAiTurnDispatcherPort>;
  let useCase: CancelConversationTurnUseCase;

  let testConv: AiConversation;
  let testTurn: AiConversationTurn;

  beforeEach(() => {
    testConv = AiConversation.create({
      tenantId: TENANT_ID,
      userId: USER_ID,
      title: ConversationTitle.create('Cancellation Test'),
    });

    testTurn = AiConversationTurn.create({
      tenantId: TENANT_ID,
      conversationId: testConv.id,
      turnIndex: 1,
      status: TurnStatus.PENDING,
      clientTurnId: 'turn_client_cancel_1',
      idempotencyKey: 'idemp_cancel_1',
      idempotencyPayloadHash: 'hash_cancel_1',
      activeAttemptId: MessageId.create('msg_assistant_1'),
      activeAttemptNumber: 1,
    });

    convRepo = {
      save: jest.fn().mockResolvedValue(testConv),
      findById: jest.fn().mockResolvedValue(testConv),
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      listByUser: jest.fn().mockResolvedValue([]),
      listForAudit: jest.fn().mockResolvedValue([]),
      softDelete: jest.fn().mockResolvedValue(undefined),
      updateMetadata: jest.fn().mockResolvedValue(testConv),
    };

    turnRepo = {
      save: jest.fn().mockResolvedValue(testTurn),
      findById: jest.fn().mockResolvedValue(testTurn),
      findByClientTurnId: jest.fn().mockResolvedValue(testTurn),
      findByIdempotencyKey: jest.fn().mockResolvedValue(testTurn),
      findByTurnIndex: jest.fn().mockResolvedValue(testTurn),
      findActiveTurn: jest.fn().mockResolvedValue(testTurn),
      listByConversation: jest.fn().mockResolvedValue([testTurn]),
      updateStatus: jest.fn().mockResolvedValue(testTurn),
    };

    messageRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findBySequenceNumber: jest.fn(),
      listByTurn: jest.fn(),
      listCanonicalHistory: jest.fn(),
      findCanonicalAssistantMessage: jest.fn(),
      acquireLease: jest.fn(),
      updateStatus: jest.fn().mockResolvedValue({} as unknown as AiConversationMessage),
    };

    dispatcher = {
      dispatchTurn: jest.fn(),
      cancelTurn: jest.fn().mockResolvedValue(true),
      isTurnActive: jest.fn().mockReturnValue(true),
    };

    useCase = new CancelConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      undefined, // txRunner fallback to direct repos
      dispatcher,
    );
  });

  describe('Validation & Ownership', () => {
    it('throws InvalidTurnInputError if required parameters are missing', async () => {
      await expect(useCase.execute(null as unknown as CancelConversationTurnInput)).rejects.toThrow(
        InvalidTurnInputError,
      );

      await expect(
        useCase.execute({
          tenantId: '',
          userId: USER_ID,
          conversationId: testConv.id.value,
          turnId: testTurn.id.value,
        }),
      ).rejects.toThrow(InvalidTurnInputError);
    });

    it('throws ConversationNotFoundError if conversation does not exist', async () => {
      convRepo.findById.mockResolvedValue(null);

      await expect(
        useCase.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: 'conv_non_existent',
          turnId: testTurn.id.value,
        }),
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it('throws TenantOwnershipViolationError if conversation belongs to another user', async () => {
      await expect(
        useCase.execute({
          tenantId: TENANT_ID,
          userId: OTHER_USER_ID,
          conversationId: testConv.id.value,
          turnId: testTurn.id.value,
        }),
      ).rejects.toThrow(TenantOwnershipViolationError);
    });

    it('throws TurnNotFoundError if turn does not exist', async () => {
      turnRepo.findById.mockResolvedValue(null);

      await expect(
        useCase.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: testConv.id.value,
          turnId: 'turn_non_existent',
        }),
      ).rejects.toThrow(TurnNotFoundError);
    });
  });

  describe('Terminal State & Idempotency', () => {
    it('throws InvalidConversationLifecycleError if turn has already COMPLETED', async () => {
      const completedTurn = AiConversationTurn.create({
        tenantId: TENANT_ID,
        conversationId: testConv.id,
        turnIndex: 1,
        status: TurnStatus.COMPLETED,
        clientTurnId: 'turn_client_completed',
        idempotencyKey: 'idemp_completed',
        idempotencyPayloadHash: 'hash_completed',
        activeAttemptId: MessageId.create('msg_assistant_1'),
        activeAttemptNumber: 1,
      });
      turnRepo.findById.mockResolvedValue(completedTurn);

      await expect(
        useCase.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: testConv.id.value,
          turnId: completedTurn.id.value,
        }),
      ).rejects.toThrow(InvalidConversationLifecycleError);
    });

    it('returns fast-path result if turn is already CANCELLED (idempotent)', async () => {
      const cancelledTurn = AiConversationTurn.create({
        tenantId: TENANT_ID,
        conversationId: testConv.id,
        turnIndex: 1,
        status: TurnStatus.CANCELLED,
        clientTurnId: 'turn_client_cancelled',
        idempotencyKey: 'idemp_cancelled',
        idempotencyPayloadHash: 'hash_cancelled',
        activeAttemptId: MessageId.create('msg_assistant_1'),
        activeAttemptNumber: 1,
      });
      turnRepo.findById.mockResolvedValue(cancelledTurn);

      const result = await useCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: testConv.id.value,
        turnId: cancelledTurn.id.value,
      });

      expect(result.turnStatus).toBe(TurnStatus.CANCELLED);
      expect(result.isAlreadyCancelled).toBe(true);
      expect(dispatcher.cancelTurn).not.toHaveBeenCalled();
    });

    it('successfully transitions active turn to CANCELLED and signals dispatcher', async () => {
      const result = await useCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: testConv.id.value,
        turnId: testTurn.id.value,
        reason: 'User cancelled turn generation',
      });

      expect(result.turnStatus).toBe(TurnStatus.CANCELLED);
      expect(result.isAlreadyCancelled).toBe(false);

      // Verify in-flight dispatcher signaling
      expect(dispatcher.cancelTurn).toHaveBeenCalledWith(
        TENANT_ID,
        testConv.id.value,
        testTurn.id.value,
        'User cancelled turn generation',
      );

      // Verify database mutations
      expect(turnRepo.updateStatus).toHaveBeenCalledWith(
        TENANT_ID,
        testConv.id.value,
        testTurn.id.value,
        expect.objectContaining({
          status: TurnStatus.CANCELLED,
        }),
      );

      expect(messageRepo.updateStatus).toHaveBeenCalledWith(
        TENANT_ID,
        testConv.id.value,
        'msg_assistant_1',
        expect.objectContaining({
          status: GenerationStatus.CANCELLED,
          isCanonical: false,
          errorCode: 'GENERATION_CANCELLED',
        }),
      );

      expect(convRepo.updateMetadata).toHaveBeenCalledWith(
        TENANT_ID,
        testConv.id.value,
        expect.objectContaining({
          lastActivityAt: expect.any(Date),
        }),
      );
    });

    it('resolves turn from messageId when turnId is omitted', async () => {
      const mockMsg = {
        id: MessageId.create('msg_assistant_1'),
        turnId: testTurn.id,
      } as unknown as AiConversationMessage;
      messageRepo.findById.mockResolvedValue(mockMsg);

      const result = await useCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: testConv.id.value,
        messageId: 'msg_assistant_1',
      });

      expect(messageRepo.findById).toHaveBeenCalledWith(
        TENANT_ID,
        testConv.id.value,
        'msg_assistant_1',
      );
      expect(result.turnId).toBe(testTurn.id.value);
      expect(result.turnStatus).toBe(TurnStatus.CANCELLED);
    });

    it('resolves active in-flight turn when neither turnId nor messageId is provided', async () => {
      (turnRepo.findActiveTurn as jest.Mock).mockResolvedValue(testTurn);

      const result = await useCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: testConv.id.value,
      });

      expect(turnRepo.findActiveTurn).toHaveBeenCalledWith(TENANT_ID, testConv.id.value);
      expect(result.turnId).toBe(testTurn.id.value);
      expect(result.turnStatus).toBe(TurnStatus.CANCELLED);
    });

    it('throws InvalidTurnInputError if neither turnId nor messageId is provided and no active turn exists', async () => {
      (turnRepo.findActiveTurn as jest.Mock).mockResolvedValue(null);

      await expect(
        useCase.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: testConv.id.value,
        }),
      ).rejects.toThrow(InvalidTurnInputError);
    });
  });
});
