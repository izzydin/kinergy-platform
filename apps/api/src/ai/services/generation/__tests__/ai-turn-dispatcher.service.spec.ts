import { AiTurnDispatcherService } from '../ai-turn-dispatcher.service';
import {
  IAiConversationTurnRepositoryPort,
  ExecuteConversationTurnUseCase,
  TurnStatus,
  AiConversationTurn,
  ConversationId,
  TurnId,
} from '@kinergy-platform/core';

describe('AiTurnDispatcherService', () => {
  const TENANT_ID = 'tenant_dispatcher_test';
  const USER_ID = 'user_dispatcher_test';
  const CONV_ID = 'conv_dispatcher_1';
  const TURN_ID = 'turn_dispatcher_1';

  let turnRepo: jest.Mocked<IAiConversationTurnRepositoryPort>;
  let executeTurnUseCase: jest.Mocked<ExecuteConversationTurnUseCase>;
  let service: AiTurnDispatcherService;

  let testTurn: AiConversationTurn;

  beforeEach(() => {
    testTurn = AiConversationTurn.create({
      tenantId: TENANT_ID,
      conversationId: ConversationId.create(CONV_ID),
      id: TurnId.create(TURN_ID),
      turnIndex: 1,
      status: TurnStatus.PENDING,
      clientTurnId: 'turn_client_1',
      idempotencyKey: 'idemp_1',
      idempotencyPayloadHash: 'hash_1',
    });

    turnRepo = {
      save: jest.fn().mockResolvedValue(testTurn),
      findById: jest.fn().mockResolvedValue(testTurn),
      findByClientTurnId: jest.fn().mockResolvedValue(testTurn),
      findByIdempotencyKey: jest.fn().mockResolvedValue(testTurn),
      findByTurnIndex: jest.fn().mockResolvedValue(testTurn),
      findActiveTurn: jest.fn().mockResolvedValue(testTurn),
      listByConversation: jest.fn().mockResolvedValue([testTurn]),
      updateStatus: jest.fn().mockResolvedValue(testTurn),
      findPendingOrStalledTurns: jest.fn().mockResolvedValue([]),
    };

    executeTurnUseCase = {
      execute: jest.fn().mockResolvedValue({
        conversationId: CONV_ID,
        turnId: TURN_ID,
        turnStatus: TurnStatus.COMPLETED,
        assistantMessageId: 'msg_assistant_1',
        content: 'Test generated answer',
        isCanonical: true,
        isGrounded: true,
        outcome: 'SUCCESS',
        sources: [],
        metadata: {},
      }),
    } as unknown as jest.Mocked<ExecuteConversationTurnUseCase>;

    service = new AiTurnDispatcherService(turnRepo, executeTurnUseCase);
  });

  it('dispatches a pending turn successfully and executes asynchronously', async () => {
    const result = await service.dispatchTurn({
      tenantId: TENANT_ID,
      userId: USER_ID,
      conversationId: CONV_ID,
      turnId: TURN_ID,
      attemptId: 'msg_assistant_1',
      attemptNumber: 1,
      actorContext: { roles: ['DOCTOR'], permissions: ['ai:conversation:turn'] },
    });

    expect(result.dispatched).toBe(true);
    expect(result.status).toBe('DISPATCHED');
    expect(service.isTurnActive(TENANT_ID, CONV_ID, TURN_ID)).toBe(true);

    // Wait for setImmediate background execution
    await new Promise((resolve) => setImmediate(resolve));

    expect(executeTurnUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: CONV_ID,
        turnId: TURN_ID,
        signal: expect.any(AbortSignal),
      }),
    );

    // After completion, turn should no longer be active in-memory
    expect(service.isTurnActive(TENANT_ID, CONV_ID, TURN_ID)).toBe(false);
  });

  it('deduplicates concurrent dispatches for the same active turn', async () => {
    // First dispatch
    await service.dispatchTurn({
      tenantId: TENANT_ID,
      userId: USER_ID,
      conversationId: CONV_ID,
      turnId: TURN_ID,
      attemptId: 'msg_assistant_1',
      attemptNumber: 1,
      actorContext: { roles: [], permissions: [] },
    });

    // Second duplicate dispatch while first is still active
    const secondResult = await service.dispatchTurn({
      tenantId: TENANT_ID,
      userId: USER_ID,
      conversationId: CONV_ID,
      turnId: TURN_ID,
      attemptId: 'msg_assistant_1',
      attemptNumber: 1,
      actorContext: { roles: [], permissions: [] },
    });

    expect(secondResult.dispatched).toBe(false);
    expect(secondResult.status).toBe('ALREADY_ACTIVE');
  });

  it('skips dispatch if turn is already COMPLETED in database', async () => {
    const completedTurn = AiConversationTurn.create({
      tenantId: TENANT_ID,
      conversationId: ConversationId.create(CONV_ID),
      id: TurnId.create(TURN_ID),
      turnIndex: 1,
      status: TurnStatus.COMPLETED,
      clientTurnId: 'turn_client_completed',
      idempotencyKey: 'idemp_completed',
      idempotencyPayloadHash: 'hash_completed',
    });
    turnRepo.findById.mockResolvedValue(completedTurn);

    const result = await service.dispatchTurn({
      tenantId: TENANT_ID,
      userId: USER_ID,
      conversationId: CONV_ID,
      turnId: TURN_ID,
      attemptId: 'msg_assistant_1',
      attemptNumber: 1,
      actorContext: { roles: [], permissions: [] },
    });

    expect(result.dispatched).toBe(false);
    expect(result.status).toBe('ALREADY_COMPLETED');
    expect(executeTurnUseCase.execute).not.toHaveBeenCalled();
  });

  it('skips dispatch if turn is CANCELLED in database', async () => {
    const cancelledTurn = AiConversationTurn.create({
      tenantId: TENANT_ID,
      conversationId: ConversationId.create(CONV_ID),
      id: TurnId.create(TURN_ID),
      turnIndex: 1,
      status: TurnStatus.CANCELLED,
      clientTurnId: 'turn_client_cancelled',
      idempotencyKey: 'idemp_cancelled',
      idempotencyPayloadHash: 'hash_cancelled',
    });
    turnRepo.findById.mockResolvedValue(cancelledTurn);

    const result = await service.dispatchTurn({
      tenantId: TENANT_ID,
      userId: USER_ID,
      conversationId: CONV_ID,
      turnId: TURN_ID,
      attemptId: 'msg_assistant_1',
      attemptNumber: 1,
      actorContext: { roles: [], permissions: [] },
    });

    expect(result.dispatched).toBe(false);
    expect(result.status).toBe('SKIPPED');
  });

  it('signals cancellation to in-flight turn execution', async () => {
    let resolveExecution: (() => void) | undefined;
    let capturedSignal: AbortSignal | undefined;
    executeTurnUseCase.execute.mockImplementation(async (input) => {
      capturedSignal = input.signal;
      return new Promise((resolve) => {
        resolveExecution = () =>
          resolve({
            conversationId: CONV_ID,
            turnId: TURN_ID,
            turnStatus: TurnStatus.CANCELLED,
            assistantMessageId: 'msg_assistant_1',
            content: '',
            isCanonical: false,
            isGrounded: false,
            outcome: 'CANCELLED',
            sources: [],
            metadata: {},
          });
      });
    });

    await service.dispatchTurn({
      tenantId: TENANT_ID,
      userId: USER_ID,
      conversationId: CONV_ID,
      turnId: TURN_ID,
      attemptId: 'msg_assistant_1',
      attemptNumber: 1,
      actorContext: { roles: [], permissions: [] },
    });

    // Wait for setImmediate to invoke execute
    await new Promise((resolve) => setImmediate(resolve));

    expect(service.isTurnActive(TENANT_ID, CONV_ID, TURN_ID)).toBe(true);
    expect(capturedSignal).toBeDefined();

    const cancelled = await service.cancelTurn(TENANT_ID, CONV_ID, TURN_ID, 'User aborted');
    expect(cancelled).toBe(true);
    expect(capturedSignal?.aborted).toBe(true);

    resolveExecution?.();
  });

  it('aborts all active executions when abortAllActive is invoked', async () => {
    let resolveExecution: (() => void) | undefined;
    let capturedSignal: AbortSignal | undefined;
    executeTurnUseCase.execute.mockImplementation(async (input) => {
      capturedSignal = input.signal;
      return new Promise((resolve) => {
        resolveExecution = () =>
          resolve({
            conversationId: CONV_ID,
            turnId: TURN_ID,
            turnStatus: TurnStatus.CANCELLED,
            assistantMessageId: 'msg_assistant_1',
            content: '',
            isCanonical: false,
            isGrounded: false,
            outcome: 'CANCELLED',
            sources: [],
            metadata: {},
          });
      });
    });

    await service.dispatchTurn({
      tenantId: TENANT_ID,
      userId: USER_ID,
      conversationId: CONV_ID,
      turnId: TURN_ID,
      attemptId: 'msg_assistant_1',
      attemptNumber: 1,
      actorContext: { roles: [], permissions: [] },
    });

    // Wait for setImmediate to invoke execute
    await new Promise((resolve) => setImmediate(resolve));

    expect(service.getActiveCount()).toBe(1);
    expect(capturedSignal).toBeDefined();

    service.abortAllActive('WORKER_SHUTDOWN');
    expect(capturedSignal?.aborted).toBe(true);

    resolveExecution?.();
  });
});
