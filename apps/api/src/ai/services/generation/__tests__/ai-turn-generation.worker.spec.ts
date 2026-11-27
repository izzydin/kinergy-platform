import { AiTurnGenerationWorker } from '../ai-turn-generation.worker';
import { AiTurnDispatcherService } from '../ai-turn-dispatcher.service';
import {
  IAiConversationTurnRepositoryPort,
  IAiConversationRepositoryPort,
  TurnStatus,
  AiConversationTurn,
  AiConversation,
  ConversationId,
  TurnId,
  ConversationTitle,
} from '@kinergy-platform/core';

describe('AiTurnGenerationWorker', () => {
  const TENANT_ID = 'tenant_worker_test';
  const USER_ID = 'user_worker_test';
  const CONV_ID = 'conv_worker_1';
  const TURN_ID = 'turn_worker_1';

  let turnRepo: jest.Mocked<IAiConversationTurnRepositoryPort>;
  let convRepo: jest.Mocked<IAiConversationRepositoryPort>;
  let dispatcher: jest.Mocked<AiTurnDispatcherService>;
  let worker: AiTurnGenerationWorker;

  let testConv: AiConversation;
  let testTurn: AiConversationTurn;

  beforeEach(() => {
    testConv = AiConversation.create({
      tenantId: TENANT_ID,
      userId: USER_ID,
      title: ConversationTitle.create('Worker Test Conversation'),
    });

    testTurn = AiConversationTurn.create({
      tenantId: TENANT_ID,
      conversationId: ConversationId.create(CONV_ID),
      id: TurnId.create(TURN_ID),
      turnIndex: 1,
      status: TurnStatus.PENDING,
      clientTurnId: 'turn_client_worker_1',
      idempotencyKey: 'idemp_worker_1',
      idempotencyPayloadHash: 'hash_worker_1',
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
      findPendingOrStalledTurns: jest.fn().mockResolvedValue([testTurn]),
    };

    convRepo = {
      save: jest.fn().mockResolvedValue(testConv),
      findById: jest.fn().mockResolvedValue(testConv),
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      listByUser: jest.fn().mockResolvedValue([]),
      listForAudit: jest.fn().mockResolvedValue([]),
      softDelete: jest.fn().mockResolvedValue(undefined),
      updateMetadata: jest.fn().mockResolvedValue(testConv),
    };

    dispatcher = {
      dispatchTurn: jest.fn().mockResolvedValue({
        turnId: TURN_ID,
        dispatched: true,
        status: 'DISPATCHED',
      }),
      cancelTurn: jest.fn().mockResolvedValue(true),
      isTurnActive: jest.fn().mockReturnValue(false),
      getActiveCount: jest.fn().mockReturnValue(0),
      abortAllActive: jest.fn(),
    } as unknown as jest.Mocked<AiTurnDispatcherService>;

    worker = new AiTurnGenerationWorker(turnRepo, convRepo, dispatcher, {
      enabled: false, // Don't start timer in tests
      pollIntervalMs: 1000,
      staleThresholdMs: 300_000,
      batchSize: 10,
      shutdownTimeoutMs: 1000,
    });
  });

  it('polls and dispatches pending turns', async () => {
    const result = await worker.poll();

    expect(result.recoveredPending).toBe(1);
    expect(result.recoveredStalled).toBe(0);

    expect(dispatcher.dispatchTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: CONV_ID,
        turnId: TURN_ID,
      }),
    );
  });

  it('skips turns that are already active on the dispatcher', async () => {
    dispatcher.isTurnActive.mockReturnValue(true);

    const result = await worker.poll();

    expect(result.recoveredPending).toBe(0);
    expect(result.recoveredStalled).toBe(0);
    expect(dispatcher.dispatchTurn).not.toHaveBeenCalled();
  });

  it('handles empty candidate list cleanly', async () => {
    (turnRepo.findPendingOrStalledTurns as jest.Mock).mockResolvedValue([]);

    const result = await worker.poll();

    expect(result.recoveredPending).toBe(0);
    expect(result.recoveredStalled).toBe(0);
    expect(dispatcher.dispatchTurn).not.toHaveBeenCalled();
  });

  it('aborts active turns when shutdown budget expires', async () => {
    dispatcher.getActiveCount.mockReturnValue(2);

    const shutdownPromise = worker.onApplicationShutdown('SIGTERM');

    // Simulate active turns staying alive past shutdown timeout
    await shutdownPromise;

    expect(dispatcher.abortAllActive).toHaveBeenCalledWith('WORKER_SHUTDOWN');
  });

  it('rehydrates user roles dynamically from IUserRepository upon recovery', async () => {
    const mockUserRepo = {
      findById: jest.fn().mockResolvedValue({
        id: USER_ID,
        status: 'ACTIVE',
        roles: ['Therapist', 'Clinical Staff'],
        permissions: ['ai:read'],
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const workerWithUserRepo = new AiTurnGenerationWorker(
      turnRepo,
      convRepo,
      dispatcher,
      { enabled: false },
      mockUserRepo,
    );

    const result = await workerWithUserRepo.poll();
    expect(result.recoveredPending).toBe(1);

    expect(dispatcher.dispatchTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: TENANT_ID,
        userId: USER_ID,
        actorContext: {
          roles: ['Therapist', 'Clinical Staff'],
          permissions: ['ai:read'],
        },
      }),
    );
  });

  it('skips turn recovery and fails closed if user is inactive in IUserRepository', async () => {
    const mockUserRepo = {
      findById: jest.fn().mockResolvedValue({
        id: USER_ID,
        status: 'DISABLED',
        roles: ['Therapist'],
        permissions: [],
      }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const workerWithDisabledUser = new AiTurnGenerationWorker(
      turnRepo,
      convRepo,
      dispatcher,
      { enabled: false },
      mockUserRepo,
    );

    const result = await workerWithDisabledUser.poll();
    expect(result.recoveredPending).toBe(0);
    expect(dispatcher.dispatchTurn).not.toHaveBeenCalled();
  });
});
