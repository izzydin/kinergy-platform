import { RegenerateConversationTurnUseCase } from '../use-cases/regenerate-conversation-turn.use-case';
import { RegenerateConversationTurnInput } from '../dtos/ai-conversation.dtos';
import { IAiConversationRepositoryPort } from '../../ports/outbound/ai-conversation-repository.port';
import { IAiConversationTurnRepositoryPort } from '../../ports/outbound/ai-conversation-turn-repository.port';
import { IAiConversationMessageRepositoryPort } from '../../ports/outbound/ai-conversation-message-repository.port';
import { IAiTurnDispatcherPort } from '../../ports/inbound/ai-turn-dispatcher.port';
import { AiConversation } from '../../domain/models/ai-conversation.entity';
import { AiConversationTurn } from '../../domain/models/ai-conversation-turn.entity';
import { AiConversationMessage } from '../../domain/models/ai-conversation-message.entity';
import { ConversationTitle } from '../../domain/value-objects/conversation-title.vo';
import { TurnStatus } from '../../domain/enums/turn-status.enum';
import { GenerationStatus } from '../../domain/enums/generation-status.enum';
import { ConversationRole } from '../../domain/enums/conversation-role.enum';
import { MessageId } from '../../domain/value-objects/message-id.vo';
import {
  InvalidTurnInputError,
  ConversationNotFoundError,
  TurnNotFoundError,
  TenantOwnershipViolationError,
  InvalidConversationLifecycleError,
  TurnAlreadyInProgressError,
} from '../errors/ai-conversation-application.error';

describe('RegenerateConversationTurnUseCase (FB.05)', () => {
  const TENANT_ID = 'tenant_regen_test';
  const USER_ID = 'user_physio_1';
  const OTHER_USER_ID = 'user_intruder';

  let convRepo: jest.Mocked<IAiConversationRepositoryPort>;
  let turnRepo: jest.Mocked<IAiConversationTurnRepositoryPort>;
  let messageRepo: jest.Mocked<IAiConversationMessageRepositoryPort>;
  let dispatcher: jest.Mocked<IAiTurnDispatcherPort>;
  let useCase: RegenerateConversationTurnUseCase;

  let testConv: AiConversation;
  let testTurn: AiConversationTurn;
  let userMessage: AiConversationMessage;
  let assistantMessageAttempt1: AiConversationMessage;

  beforeEach(() => {
    testConv = AiConversation.create({
      tenantId: TENANT_ID,
      userId: USER_ID,
      title: ConversationTitle.create('Regeneration Test Thread'),
    });
    testConv.incrementTurnCounter(); // turn 1
    testConv.incrementMessageCounter(); // seq 1
    testConv.incrementMessageCounter(); // seq 2

    testTurn = AiConversationTurn.create({
      tenantId: TENANT_ID,
      conversationId: testConv.id,
      turnIndex: 1,
      status: TurnStatus.COMPLETED,
      clientTurnId: 'turn_client_orig_1',
      idempotencyKey: 'idemp_orig_1',
      idempotencyPayloadHash: 'hash_orig_1',
      activeAttemptId: MessageId.create('msg_asst_att1'),
      activeAttemptNumber: 1,
    });

    userMessage = AiConversationMessage.create({
      id: MessageId.create('msg_user_1'),
      turnId: testTurn.id,
      conversationId: testConv.id,
      tenantId: TENANT_ID,
      role: ConversationRole.USER,
      sequenceNumber: 1,
      attemptNumber: 1,
      isCanonical: false,
      status: GenerationStatus.SUCCESS,
      content: '¿Cuál es el protocolo de ejercicios para esguince grado II?',
    });

    assistantMessageAttempt1 = AiConversationMessage.create({
      id: MessageId.create('msg_asst_att1'),
      turnId: testTurn.id,
      conversationId: testConv.id,
      tenantId: TENANT_ID,
      role: ConversationRole.ASSISTANT,
      sequenceNumber: 2,
      attemptNumber: 1,
      isCanonical: true,
      status: GenerationStatus.SUCCESS,
      content: 'Respuesta inicial fundamentada en protocolo RICE.',
    });

    convRepo = {
      save: jest.fn().mockImplementation(async (c) => c),
      findById: jest.fn().mockResolvedValue(testConv),
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      listByUser: jest.fn().mockResolvedValue([]),
      listForAudit: jest.fn().mockResolvedValue([]),
      softDelete: jest.fn().mockResolvedValue(undefined),
      updateMetadata: jest.fn().mockResolvedValue(testConv),
    };

    turnRepo = {
      save: jest.fn().mockImplementation(async (t) => t),
      findById: jest.fn().mockResolvedValue(testTurn),
      findByClientTurnId: jest.fn().mockResolvedValue(null),
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      findByTurnIndex: jest.fn().mockResolvedValue(testTurn),
      findActiveTurn: jest.fn().mockResolvedValue(null),
      listByConversation: jest.fn().mockResolvedValue([testTurn]),
      updateStatus: jest.fn().mockResolvedValue(testTurn),
    };

    messageRepo = {
      save: jest.fn().mockImplementation(async (m) => m),
      findById: jest.fn().mockImplementation(async (_tenantId, _convId, id) => {
        if (id === 'msg_asst_att1') return assistantMessageAttempt1;
        if (id === 'msg_user_1') return userMessage;
        return null;
      }),
      findBySequenceNumber: jest.fn().mockResolvedValue(null),
      listByTurn: jest.fn().mockResolvedValue([userMessage, assistantMessageAttempt1]),
      listCanonicalHistory: jest
        .fn()
        .mockResolvedValue({ messages: [], nextCursor: null, hasMore: false }),
      updateStatus: jest.fn().mockResolvedValue(assistantMessageAttempt1),
      findCanonicalAssistantMessage: jest.fn().mockResolvedValue(assistantMessageAttempt1),
    };

    dispatcher = {
      dispatchTurn: jest.fn().mockResolvedValue({
        turnId: testTurn.id.value,
        dispatched: true,
        status: 'DISPATCHED',
      }),
    };

    useCase = new RegenerateConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      undefined,
      dispatcher,
    );
  });

  describe('1. Validation and Ownership Boundaries', () => {
    it('rejects missing or empty input fields', async () => {
      await expect(
        useCase.execute(null as unknown as RegenerateConversationTurnInput),
      ).rejects.toThrow(InvalidTurnInputError);
      await expect(
        useCase.execute({
          tenantId: '',
          userId: USER_ID,
          conversationId: testConv.id.value,
          messageId: 'msg_asst_att1',
        }),
      ).rejects.toThrow(InvalidTurnInputError);
      await expect(
        useCase.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: testConv.id.value,
        }),
      ).rejects.toThrow('Either turnId or messageId must be provided');
    });

    it('throws ConversationNotFoundError when conversation does not exist', async () => {
      convRepo.findById.mockResolvedValueOnce(null);

      await expect(
        useCase.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: 'conv_non_existent',
          messageId: 'msg_asst_att1',
        }),
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it('enforces tenant and user ownership boundaries (rejects cross-tenant and intruder users)', async () => {
      await expect(
        useCase.execute({
          tenantId: TENANT_ID,
          userId: OTHER_USER_ID,
          conversationId: testConv.id.value,
          messageId: 'msg_asst_att1',
        }),
      ).rejects.toThrow(TenantOwnershipViolationError);
    });

    it('rejects regeneration on archived or soft-deleted conversations', async () => {
      testConv.archive();

      await expect(
        useCase.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: testConv.id.value,
          messageId: 'msg_asst_att1',
        }),
      ).rejects.toThrow(InvalidConversationLifecycleError);
    });
  });

  describe('2. Concurrency and Eligibility Constraints', () => {
    it('enforces single active generation: blocks regeneration when another turn is currently active', async () => {
      const activeTurn = AiConversationTurn.create({
        tenantId: TENANT_ID,
        conversationId: testConv.id,
        turnIndex: 2,
        status: TurnStatus.STREAMING,
        clientTurnId: 'turn_client_streaming_2',
        idempotencyKey: 'idemp_2',
        idempotencyPayloadHash: 'hash_2',
        activeAttemptId: MessageId.create('msg_asst_2'),
        activeAttemptNumber: 1,
      });
      (turnRepo.findActiveTurn as jest.Mock).mockResolvedValueOnce(activeTurn);

      await expect(
        useCase.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: testConv.id.value,
          messageId: 'msg_asst_att1',
        }),
      ).rejects.toThrow(TurnAlreadyInProgressError);
    });

    it('rejects regenerating a turn that is currently in PENDING or STREAMING status', async () => {
      const pendingTurn = AiConversationTurn.create({
        tenantId: TENANT_ID,
        conversationId: testConv.id,
        turnIndex: 1,
        status: TurnStatus.PENDING,
        clientTurnId: 'turn_pending_1',
        idempotencyKey: 'idemp_p1',
        idempotencyPayloadHash: 'hash_p1',
        activeAttemptId: MessageId.create('msg_asst_att1'),
        activeAttemptNumber: 1,
      });
      turnRepo.findById.mockResolvedValueOnce(pendingTurn);

      await expect(
        useCase.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: testConv.id.value,
          turnId: pendingTurn.id.value,
        }),
      ).rejects.toThrow(TurnAlreadyInProgressError);
    });

    it('rejects regeneration of USER role messages', async () => {
      await expect(
        useCase.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: testConv.id.value,
          messageId: 'msg_user_1',
        }),
      ).rejects.toThrow('Only assistant messages can be regenerated');
    });

    it('enforces latest-turn constraint: rejects historical turns when subsequent turns exist', async () => {
      const turn2 = AiConversationTurn.create({
        tenantId: TENANT_ID,
        conversationId: testConv.id,
        turnIndex: 2,
        status: TurnStatus.COMPLETED,
        clientTurnId: 'turn_client_orig_2',
        idempotencyKey: 'idemp_orig_2',
        idempotencyPayloadHash: 'hash_orig_2',
        activeAttemptId: MessageId.create('msg_asst_2'),
        activeAttemptNumber: 1,
      });
      turnRepo.listByConversation.mockResolvedValueOnce([testTurn, turn2]);

      // Attempting to regenerate turn 1 when turn 2 exists must fail
      await expect(
        useCase.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: testConv.id.value,
          turnId: testTurn.id.value,
        }),
      ).rejects.toThrow('Only the latest assistant response in a conversation can be regenerated.');
    });

    it('throws TurnNotFoundError when target turn does not exist', async () => {
      turnRepo.findById.mockResolvedValueOnce(null);

      await expect(
        useCase.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: testConv.id.value,
          turnId: 'turn_missing',
        }),
      ).rejects.toThrow(TurnNotFoundError);
    });
  });

  describe('3. Successful Regeneration Workflow', () => {
    it('prepares and dispatches turn regeneration successfully by messageId', async () => {
      const result = await useCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: testConv.id.value,
        messageId: 'msg_asst_att1',
      });

      expect(result.conversationId).toBe(testConv.id.value);
      expect(result.turnId).toBe(testTurn.id.value);
      expect(result.turnIndex).toBe(1);
      expect(result.attemptNumber).toBe(2);
      expect(result.status).toBe(TurnStatus.PENDING);
      expect(result.userPrompt).toBe('¿Cuál es el protocolo de ejercicios para esguince grado II?');
      expect(result.assistantMessageId).toBeDefined();

      // Check turn was updated to PENDING and attempt number set to 2
      expect(turnRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: TurnStatus.PENDING,
          activeAttemptNumber: 2,
        }),
      );

      // Check new assistant attempt was saved with isCanonical: false, status: PENDING
      expect(messageRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          role: ConversationRole.ASSISTANT,
          attemptNumber: 2,
          isCanonical: false,
          status: GenerationStatus.PENDING,
          sequenceNumber: 3,
        }),
      );

      // Check dispatcher was notified
      expect(dispatcher.dispatchTurn).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: testConv.id.value,
          turnId: testTurn.id.value,
          attemptNumber: 2,
        }),
      );
    });

    it('prepares regeneration by turnId directly', async () => {
      const result = await useCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: testConv.id.value,
        turnId: testTurn.id.value,
      });

      expect(result.attemptNumber).toBe(2);
      expect(result.status).toBe(TurnStatus.PENDING);
      expect(dispatcher.dispatchTurn).toHaveBeenCalled();
    });

    it('preserves original assistant message content and citations intact', async () => {
      await useCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: testConv.id.value,
        messageId: 'msg_asst_att1',
      });

      // Verify original assistant attempt was NOT mutated or deleted
      expect(assistantMessageAttempt1.content).toBe(
        'Respuesta inicial fundamentada en protocolo RICE.',
      );
      expect(assistantMessageAttempt1.attemptNumber).toBe(1);
      expect(assistantMessageAttempt1.isCanonical).toBe(true); // remains canonical until attempt 2 completes
    });
  });
});
