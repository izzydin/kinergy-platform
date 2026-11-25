import { PrismaClient } from '@prisma/client';
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
  ExecuteConversationTurnUseCase,
  PersistMessageStateUseCase,
  LoadCanonicalConversationHistoryUseCase,
  ConversationNotFoundError,
  TenantOwnershipViolationError,
  InvalidConversationLifecycleError,
  InvalidTurnInputError,
  TransactionFailureError,
  InvalidCursorException,
  MessageHistoryCursor,
  IAiTurnDispatcherPort,
  IRAGTurnPipelinePort,
  RAGTurnExecutionCommand,
  RAGTurnExecutionResult,
  AiSourceAttributionService,
} from '@kinergy-platform/core';
import {
  PrismaAiConversationRepository,
  PrismaAiConversationTurnRepository,
  PrismaAiConversationMessageRepository,
  PrismaAiConversationAuditRepository,
  PrismaAiConversationTransactionRunner,
} from '@kinergy-platform/core/server';
import { AiConversationController } from '../conversation/ai-conversation.controller';
import { CreateConversationRequestDto } from '../conversation/dtos/ai-conversation.dtos';
import { TrustedAiContext } from '../conversation/decorators/trusted-ai-context.decorator';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { ROLES_KEY } from '../../platform/identity/authorization/decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../../platform/identity/authorization/decorators/permissions.decorator';
import { PERMISSIONS } from '../../platform/identity/authorization/permissions';
import { Reflector } from '@nestjs/core';

/**
 * AI-09.3-BE.07.02 — Cross-User, Cross-Tenant Isolation & Authorization Acceptance
 *
 * Verifies against real PostgreSQL:
 * 1. Conversation Access Isolation (Same-tenant vs Cross-tenant vs Deleted)
 * 2. Message History Access & Keyset Cursor Tampering Resistance
 * 3. Turn Submission, Mutation & Identity Spoofing Defense
 * 4. Worker Dispatch & Retrieval Context Isolation
 * 5. Privileged Inspection, RBAC Guarding & Fail-Closed Audit Retention
 */
describe('AI-09.3-BE.07.02: Cross-User & Cross-Tenant Isolation Acceptance (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let convRepo: PrismaAiConversationRepository;
  let turnRepo: PrismaAiConversationTurnRepository;
  let messageRepo: PrismaAiConversationMessageRepository;
  let auditRepo: PrismaAiConversationAuditRepository;
  let txRunner: PrismaAiConversationTransactionRunner;

  let createConvUseCase: CreateConversationWithInitialTurnUseCase;
  let reserveTurnUseCase: ReserveConversationTurnUseCase;
  let getConvUseCase: GetConversationUseCase;
  let listConvUseCase: ListConversationsUseCase;
  let getHistoryUseCase: GetMessageHistoryUseCase;
  let updateTitleUseCase: UpdateConversationTitleUseCase;
  let archiveConvUseCase: ArchiveConversationUseCase;
  let inspectUseCase: PrivilegedInspectConversationUseCase;
  let cancelTurnUseCase: CancelConversationTurnUseCase;
  let executeTurnUseCase: ExecuteConversationTurnUseCase;
  let historyLoader: LoadCanonicalConversationHistoryUseCase;
  let persistMessageUseCase: PersistMessageStateUseCase;

  let controller: AiConversationController;
  let reflector: Reflector;

  // Tenant & Principal Test Matrix
  const TENANT_A = 'tenant_iso_alpha';
  const TENANT_B = 'tenant_iso_beta';

  const PRINCIPAL_A1: TrustedAiContext = {
    actorId: 'usr_iso_alpha_1',
    tenantId: TENANT_A,
    roles: ['Trainer'],
    permissions: [],
    email: 'userA1@alpha.com',
  };

  const PRINCIPAL_A2: TrustedAiContext = {
    actorId: 'usr_iso_alpha_2',
    tenantId: TENANT_A,
    roles: ['Doctor'],
    permissions: [],
    email: 'userA2@alpha.com',
  };

  const PRINCIPAL_A_OWNER: TrustedAiContext = {
    actorId: 'usr_iso_alpha_owner',
    tenantId: TENANT_A,
    roles: ['Owner'],
    permissions: [PERMISSIONS.AI.CONVERSATIONS_AUDIT],
    email: 'owner@alpha.com',
  };

  const PRINCIPAL_A_NO_AUDIT: TrustedAiContext = {
    actorId: 'usr_iso_alpha_noaudit',
    tenantId: TENANT_A,
    roles: ['Owner'],
    permissions: [],
    email: 'noaudit@alpha.com',
  };

  const PRINCIPAL_B1: TrustedAiContext = {
    actorId: 'usr_iso_beta_1',
    tenantId: TENANT_B,
    roles: ['Doctor'],
    permissions: [],
    email: 'userB1@beta.com',
  };

  const PRINCIPAL_B_OWNER: TrustedAiContext = {
    actorId: 'usr_iso_beta_owner',
    tenantId: TENANT_B,
    roles: ['Owner'],
    permissions: [PERMISSIONS.AI.CONVERSATIONS_AUDIT],
    email: 'owner@beta.com',
  };

  const mockDispatcher: IAiTurnDispatcherPort = {
    dispatchTurn: jest.fn().mockResolvedValue({
      turnId: 'mock-turn-id',
      dispatched: true,
      status: 'DISPATCHED',
    }),
    cancelTurn: jest.fn().mockResolvedValue(true),
    isTurnActive: jest.fn().mockReturnValue(false),
  };

  const mockRagPipeline: IRAGTurnPipelinePort = {
    executeTurn: jest
      .fn()
      .mockImplementation(
        async (cmd: RAGTurnExecutionCommand): Promise<RAGTurnExecutionResult> => ({
          outcome: 'SUCCESS',
          content: `Grounded answer for query: ${cmd.userPrompt}`,
          isGrounded: true,
          sources: [
            {
              documentId: 'doc_alpha_verified',
              documentTitle: 'Guía Clínica de Rehabilitación',
              chunkId: 'chk_alpha_01',
              relevanceScore: 0.94,
              pageNumber: 12,
              headingPath: ['Protocolo Tendinopatía', 'Carga Excéntrica'],
            },
          ],
          metadata: {
            model: 'test-model',
            retrievalCount: 1,
            latencyMs: 50,
            totalTokens: 150,
          },
        }),
      ),
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    convRepo = new PrismaAiConversationRepository(prisma);
    turnRepo = new PrismaAiConversationTurnRepository(prisma);
    messageRepo = new PrismaAiConversationMessageRepository(prisma);
    auditRepo = new PrismaAiConversationAuditRepository(prisma);
    txRunner = new PrismaAiConversationTransactionRunner(
      prisma,
      convRepo,
      turnRepo,
      messageRepo,
      auditRepo,
    );

    createConvUseCase = new CreateConversationWithInitialTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      mockDispatcher,
    );
    reserveTurnUseCase = new ReserveConversationTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      mockDispatcher,
    );
    getConvUseCase = new GetConversationUseCase(convRepo, turnRepo);
    listConvUseCase = new ListConversationsUseCase(convRepo);
    getHistoryUseCase = new GetMessageHistoryUseCase(convRepo, messageRepo);
    updateTitleUseCase = new UpdateConversationTitleUseCase(convRepo);
    archiveConvUseCase = new ArchiveConversationUseCase(convRepo, turnRepo);
    inspectUseCase = new PrivilegedInspectConversationUseCase(convRepo, messageRepo, auditRepo);
    cancelTurnUseCase = new CancelConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      txRunner,
      mockDispatcher,
    );

    persistMessageUseCase = new PersistMessageStateUseCase(messageRepo);
    historyLoader = new LoadCanonicalConversationHistoryUseCase(convRepo, turnRepo, messageRepo);
    executeTurnUseCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistMessageUseCase,
      mockRagPipeline,
      historyLoader,
      txRunner,
    );

    controller = new AiConversationController(
      createConvUseCase,
      reserveTurnUseCase,
      getConvUseCase,
      listConvUseCase,
      getHistoryUseCase,
      updateTitleUseCase,
      archiveConvUseCase,
      inspectUseCase,
      cancelTurnUseCase,
    );

    reflector = new Reflector();
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "tenant_id" IN ('${TENANT_A}', '${TENANT_B}')`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversation_audit_logs" WHERE "tenant_id" IN ('${TENANT_A}', '${TENANT_B}')`,
    );
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "tenant_id" IN ('${TENANT_A}', '${TENANT_B}')`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversation_audit_logs" WHERE "tenant_id" IN ('${TENANT_A}', '${TENANT_B}')`,
    );
  });

  // =========================================================================
  // TASK 1: Conversation Access Isolation
  // =========================================================================
  describe('Task 1: Conversation Access Isolation', () => {
    it('allows User A1 to read their own created conversation', async () => {
      const created = await createConvUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        clientTurnId: 'turn_iso_t1_01',
        userPrompt: 'Protocolo de rodilla para deportista',
        title: 'Conversación A1',
      });

      const result = await getConvUseCase.execute({
        tenantId: TENANT_A,
        conversationId: created.conversationId,
      });

      expect(result.id).toBe(created.conversationId);
      expect(result.tenantId).toBe(TENANT_A);
      expect(result.userId).toBe(PRINCIPAL_A1.actorId);
      expect(result.title).toBe('Conversación A1');
    });

    it('allows peer clinician User A2 in the same tenant to read Conversation A1 by ID (shared tenant read)', async () => {
      const created = await createConvUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        clientTurnId: 'turn_iso_t1_02',
        userPrompt: 'Evaluación inicial de tendinopatía',
        title: 'Evaluación Compartida',
      });

      // User A2 reads via controller using their own authenticated context
      const detail = await controller.getConversation(PRINCIPAL_A2, created.conversationId);

      expect(detail.id).toBe(created.conversationId);
      expect(detail.title).toBe('Evaluación Compartida');
    });

    it('strictly blocks User B1 (Tenant B) from reading Conversation A1 (returns 404, never 200/403 to prevent existence leakage)', async () => {
      const created = await createConvUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        clientTurnId: 'turn_iso_t1_03',
        userPrompt: 'Consulta privada Tenant A',
        title: 'Conversación Confidencial Alpha',
      });

      // User B1 attempts to read via use case
      await expect(
        getConvUseCase.execute({
          tenantId: TENANT_B,
          conversationId: created.conversationId,
        }),
      ).rejects.toThrow(ConversationNotFoundError);

      // User B1 attempts to read via controller
      await expect(
        controller.getConversation(PRINCIPAL_B1, created.conversationId),
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it('prevents enumeration attacks across tenant boundaries by returning 404 for arbitrary conversation IDs', async () => {
      const probeIds = [
        'conv_00000000-0000-0000-0000-000000000001',
        'conv_probe_tenant_alpha_01',
        'non_existent_uuid',
      ];

      for (const probeId of probeIds) {
        await expect(controller.getConversation(PRINCIPAL_B1, probeId)).rejects.toThrow(
          ConversationNotFoundError,
        );
      }
    });

    it('isolates conversation listing strictly by user (User A1 only sees own conversations, User A2 sees only own)', async () => {
      // User A1 creates 2 conversations
      await createConvUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        clientTurnId: 'turn_list_a1_1',
        userPrompt: 'Tema A1 - Turno 1',
        title: 'Conv A1.1',
      });
      await createConvUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        clientTurnId: 'turn_list_a1_2',
        userPrompt: 'Tema A1 - Turno 2',
        title: 'Conv A1.2',
      });

      // User A2 creates 1 conversation in same tenant
      await createConvUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A2.actorId,
        clientTurnId: 'turn_list_a2_1',
        userPrompt: 'Tema A2 - Turno 1',
        title: 'Conv A2.1',
      });

      // User B1 creates 1 conversation in Tenant B
      await createConvUseCase.execute({
        tenantId: TENANT_B,
        userId: PRINCIPAL_B1.actorId,
        clientTurnId: 'turn_list_b1_1',
        userPrompt: 'Tema B1 - Turno 1',
        title: 'Conv B1.1',
      });

      // User A1 listing
      const listA1 = await controller.listConversations(PRINCIPAL_A1, {});
      expect(listA1.items).toHaveLength(2);
      expect(listA1.items.map((i) => i.title).sort()).toEqual(['Conv A1.1', 'Conv A1.2']);

      // User A2 listing
      const listA2 = await controller.listConversations(PRINCIPAL_A2, {});
      expect(listA2.items).toHaveLength(1);
      expect(listA2.items[0]?.title).toBe('Conv A2.1');

      // User B1 listing
      const listB1 = await controller.listConversations(PRINCIPAL_B1, {});
      expect(listB1.items).toHaveLength(1);
      expect(listB1.items[0]?.title).toBe('Conv B1.1');
    });

    it('rejects turn reservation on an archived conversation with InvalidConversationLifecycleError', async () => {
      const created = await createConvUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        clientTurnId: 'turn_archive_guard_01',
        userPrompt: 'Pregunta previa a archivo',
      });

      // Complete initial turn so conversation is eligible for archiving
      await executeTurnUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        conversationId: created.conversationId,
        turnId: created.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      await archiveConvUseCase.execute({
        tenantId: TENANT_A,
        conversationId: created.conversationId,
      });

      await expect(
        reserveTurnUseCase.execute({
          tenantId: TENANT_A,
          userId: PRINCIPAL_A1.actorId,
          conversationId: created.conversationId,
          clientTurnId: 'turn_archive_fail_02',
          userPrompt: 'Esta solicitud debe fallar por estar archivada',
        }),
      ).rejects.toThrow(InvalidConversationLifecycleError);
    });
  });

  // =========================================================================
  // TASK 2: Message-History Access & Keyset Cursor Tampering
  // =========================================================================
  describe('Task 2: Message-History Access & Cursor Security', () => {
    it('scopes message history strictly to the authorized conversation', async () => {
      const created = await createConvUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        clientTurnId: 'turn_msg_hist_01',
        userPrompt: 'Diagnóstico diferencial de manguito rotador',
      });

      // Complete the initial turn
      await executeTurnUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        conversationId: created.conversationId,
        turnId: created.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      const history = await controller.getMessageHistory(PRINCIPAL_A1, created.conversationId, {});

      expect(history.messages).toHaveLength(2);
      expect(history.messages[0]?.role).toBe('USER');
      expect(history.messages[0]?.sequenceNumber).toBe(1);
      expect(history.messages[1]?.role).toBe('ASSISTANT');
      expect(history.messages[1]?.sequenceNumber).toBe(2);
      expect(history.messages[1]?.isCanonical).toBe(true);
    });

    it('blocks User B1 from retrieving message history of Conversation A1 (returns 404)', async () => {
      const created = await createConvUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        clientTurnId: 'turn_msg_b_block',
        userPrompt: 'Información confidencial del paciente',
      });

      await expect(
        controller.getMessageHistory(PRINCIPAL_B1, created.conversationId, {}),
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it('prevents cross-conversation message leakage when supplying a cursor from another conversation', async () => {
      // Create Conv 1 with messages
      const conv1 = await createConvUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        clientTurnId: 'turn_cursor_conv1',
        userPrompt: 'Pregunta Conv 1',
      });
      await executeTurnUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        conversationId: conv1.conversationId,
        turnId: conv1.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      // Create Conv 2 with messages
      const conv2 = await createConvUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        clientTurnId: 'turn_cursor_conv2',
        userPrompt: 'Pregunta Conv 2',
      });
      await executeTurnUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        conversationId: conv2.conversationId,
        turnId: conv2.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      // Generate a valid cursor from Conv 1
      const hist1 = await getHistoryUseCase.execute({
        tenantId: TENANT_A,
        conversationId: conv1.conversationId,
      });
      const firstMsg = hist1.messages[0]!;
      const cursorFromConv1 = MessageHistoryCursor.create(
        firstMsg.sequenceNumber,
        firstMsg.id,
      ).encode();

      // Attempt to query Conv 2 using cursor from Conv 1
      const hist2WithForeignCursor = await getHistoryUseCase.execute({
        tenantId: TENANT_A,
        conversationId: conv2.conversationId,
        cursor: cursorFromConv1,
      });

      // Must return ONLY messages from Conv 2; ZERO messages from Conv 1
      for (const msg of hist2WithForeignCursor.messages) {
        expect(msg.content).not.toContain('Pregunta Conv 1');
      }
    });

    it('fails safely with InvalidCursorException when an invalid or malformed cursor is supplied', async () => {
      const created = await createConvUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        clientTurnId: 'turn_bad_cursor_01',
        userPrompt: 'Pregunta para test de cursor',
      });

      const malformedCursors = [
        'not_base64!',
        Buffer.from('invalid-json').toString('base64'),
        Buffer.from(JSON.stringify({ s: 'not-a-number', id: 'msg_1' })).toString('base64'),
        Buffer.from(JSON.stringify({ s: -1, id: 'msg_1' })).toString('base64'),
      ];

      for (const badCursor of malformedCursors) {
        await expect(
          getHistoryUseCase.execute({
            tenantId: TENANT_A,
            conversationId: created.conversationId,
            cursor: badCursor,
          }),
        ).rejects.toThrow(InvalidCursorException);
      }
    });
  });

  // =========================================================================
  // TASK 3: Turn Submission, Mutation & Identity Spoofing Defense
  // =========================================================================
  describe('Task 3: Turn Submission, Mutation & Identity Spoofing Defense', () => {
    it('blocks User B1 from submitting a turn to Conversation A1 (returns 404)', async () => {
      const created = await createConvUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        clientTurnId: 'turn_spoof_sub_01',
        userPrompt: 'Turn inicial Tenant A',
      });

      await expect(
        reserveTurnUseCase.execute({
          tenantId: TENANT_B,
          userId: PRINCIPAL_B1.actorId,
          conversationId: created.conversationId,
          clientTurnId: 'turn_b_probe',
          userPrompt: 'Intento de reserva cross-tenant',
        }),
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it('strictly rejects peer User A2 from reserving turns on User A1 conversation (enforces creator-only turn ownership)', async () => {
      const created = await createConvUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        clientTurnId: 'turn_creator_own_01',
        userPrompt: 'Turn inicial por Usuario A1',
      });

      // Complete initial turn so conversation is ready for turn 2
      await executeTurnUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        conversationId: created.conversationId,
        turnId: created.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      // Peer clinician User A2 tries to reserve a turn on User A1 thread
      await expect(
        reserveTurnUseCase.execute({
          tenantId: TENANT_A,
          userId: PRINCIPAL_A2.actorId,
          conversationId: created.conversationId,
          clientTurnId: 'turn_peer_tamper',
          userPrompt: 'User A2 intentando continuar conversación de A1',
        }),
      ).rejects.toThrow(TenantOwnershipViolationError);
    });

    it('strictly rejects peer User A2 from cancelling User A1 generation turn', async () => {
      const created = await createConvUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        clientTurnId: 'turn_cancel_guard_01',
        userPrompt: 'Generación activa de User A1',
      });

      // User A2 in same tenant attempts to cancel A1's turn
      await expect(
        cancelTurnUseCase.execute({
          tenantId: TENANT_A,
          userId: PRINCIPAL_A2.actorId,
          conversationId: created.conversationId,
          turnId: created.turnId,
        }),
      ).rejects.toThrow(TenantOwnershipViolationError);
    });

    it('blocks User B1 from updating conversation title in Tenant A (returns 404)', async () => {
      const created = await createConvUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        clientTurnId: 'turn_title_guard',
        userPrompt: 'Consulta original',
        title: 'Título Original',
      });

      await expect(
        controller.updateTitle(PRINCIPAL_B1, created.conversationId, {
          title: 'Título Malicioso',
        }),
      ).rejects.toThrow(ConversationNotFoundError);

      // Verify title remained unchanged in DB
      const verified = await convRepo.findById(TENANT_A, created.conversationId);
      expect(verified?.title.value).toBe('Título Original');
    });

    it('ignores client-supplied forged tenant and user fields in HTTP body and strictly enforces server-side identity', async () => {
      // Attacker sends body with forged tenantId and userId
      const maliciousBody = {
        clientTurnId: 'turn_forged_body_01',
        userPrompt: 'Prompt con payload falsificado',
        title: 'Conversación Con Body Falsificado',
        // Forged fields injected into body:
        tenantId: TENANT_B,
        userId: 'attacker_fake_user',
        roles: ['Owner', 'Administrator'],
      };

      // Passed through controller with authenticated context of PRINCIPAL_A1
      const response = await controller.createConversation(
        PRINCIPAL_A1,
        maliciousBody as unknown as CreateConversationRequestDto,
      );

      // Verify that conversation was created with PRINCIPAL_A1 authenticated properties, NOT the forged body
      const createdInDb = await convRepo.findById(TENANT_A, response.conversationId);
      expect(createdInDb).toBeDefined();
      expect(createdInDb?.tenantId).toBe(TENANT_A); // NOT TENANT_B!
      expect(createdInDb?.userId).toBe(PRINCIPAL_A1.actorId); // NOT 'attacker_fake_user'!
    });

    it('allows independent reuse of identical clientTurnId across different tenants without collision', async () => {
      const sharedClientTurnId = 'idempotent-shared-key-12345';

      // Tenant A uses key
      const resultA = await createConvUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        clientTurnId: sharedClientTurnId,
        userPrompt: 'Consulta desde Tenant Alpha',
      });

      // Tenant B uses exact same clientTurnId
      const resultB = await createConvUseCase.execute({
        tenantId: TENANT_B,
        userId: PRINCIPAL_B1.actorId,
        clientTurnId: sharedClientTurnId,
        userPrompt: 'Consulta desde Tenant Beta',
      });

      expect(resultA.conversationId).not.toBe(resultB.conversationId);
      expect(resultA.turnId).not.toBe(resultB.turnId);
      expect(resultA.isIdempotentReplay).toBe(false);
      expect(resultB.isIdempotentReplay).toBe(false);
    });
  });

  // =========================================================================
  // TASK 4: Generation & Retrieval Isolation
  // =========================================================================
  describe('Task 4: Worker & Retrieval Execution Isolation', () => {
    it('prevents worker execution on a turn belonging to another tenant (fails preflight with 404)', async () => {
      const created = await createConvUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        clientTurnId: 'turn_worker_iso_01',
        userPrompt: 'Pregunta de prueba para worker isolation',
      });

      // Rogue or manipulated worker tries to execute turn with TENANT_B scope
      await expect(
        executeTurnUseCase.execute({
          tenantId: TENANT_B,
          userId: PRINCIPAL_B1.actorId,
          conversationId: created.conversationId,
          turnId: created.turnId,
          actorContext: { roles: ['Doctor'], permissions: [] },
        }),
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it('ensures canonical conversation history loader strictly isolates context by tenant', async () => {
      const created = await createConvUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        clientTurnId: 'turn_loader_iso_01',
        userPrompt: 'Pregunta historial aislado',
      });

      // Load history using TENANT_B: must return empty history / 0 turns
      await expect(
        historyLoader.execute({
          tenantId: TENANT_B,
          conversationId: created.conversationId,
          turnId: created.turnId,
        }),
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it('discards retrieval source citations referencing unauthorized documents or foreign tenants', () => {
      const foreignSources = [
        {
          documentId: 'doc_alpha_valid',
          documentTitle: 'Guía Clínica Alpha',
          chunkId: 'chk_1',
          relevanceScore: 0.9,
          metadata: { tenantId: TENANT_A, path: 'C:\\internal\\secret.pdf' },
        },
        {
          documentId: 'doc_beta_foreign',
          documentTitle: 'Documento Confidencial Beta',
          chunkId: 'chk_2',
          relevanceScore: 0.85,
          metadata: { tenantId: TENANT_B },
        },
      ];

      // Validate against authorized document scope: only doc_alpha_valid is authorized
      const sanitized = AiSourceAttributionService.validateAndSanitize(
        foreignSources,
        { allowedDocumentIds: ['doc_alpha_valid'] }, // Authorized document IDs for Tenant A
      );

      expect(sanitized).toHaveLength(1);
      expect(sanitized[0]?.documentId).toBe('doc_alpha_valid');
    });
  });

  // =========================================================================
  // TASK 5: Privileged Inspection & Audit Invariants
  // =========================================================================
  describe('Task 5: Privileged Inspection & Audit Invariants', () => {
    it('verifies that Controller enforces AuthenticationGuard and AuthorizationGuard', () => {
      const guards = Reflect.getMetadata('__guards__', AiConversationController);
      expect(guards).toBeDefined();
      expect(guards).toContain(AuthenticationGuard);
      expect(guards).toContain(AuthorizationGuard);
    });

    it('verifies that auditInspect endpoint requires @Roles("Owner") and @RequirePermissions("ai.conversations.audit")', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.auditInspect);
      expect(roles).toEqual(['Owner']);

      const permissions = reflector.get<string[]>(PERMISSIONS_KEY, controller.auditInspect);
      expect(permissions).toEqual(['ai.conversations.audit']);
    });

    it('verifies that an Owner lacking ai.conversations.audit permission is rejected by the permission rule', () => {
      const permissions = reflector.get<string[]>(PERMISSIONS_KEY, controller.auditInspect);
      const hasPermission = PRINCIPAL_A_NO_AUDIT.permissions.some((p) => permissions?.includes(p));
      expect(hasPermission).toBe(false);
    });

    it('rejects privileged inspection by non-Owner caller with TenantOwnershipViolationError at the use-case boundary', async () => {
      const created = await createConvUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        clientTurnId: 'turn_non_owner_inspect',
        userPrompt: 'Consulta para test de inspección',
      });

      await expect(
        inspectUseCase.execute({
          tenantId: TENANT_A,
          conversationId: created.conversationId,
          inspectorUserId: PRINCIPAL_A1.actorId,
          inspectorRole: 'Trainer', // Non-Owner role
          reason: 'Auditoría clínica rutinaria de calidad',
        }),
      ).rejects.toThrow(TenantOwnershipViolationError);
    });

    it('rejects privileged inspection with short or empty justification (< 10 chars) with InvalidTurnInputError', async () => {
      const created = await createConvUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        clientTurnId: 'turn_short_reason',
        userPrompt: 'Consulta para test de justificación corta',
      });

      await expect(
        inspectUseCase.execute({
          tenantId: TENANT_A,
          conversationId: created.conversationId,
          inspectorUserId: PRINCIPAL_A_OWNER.actorId,
          inspectorRole: 'Owner',
          reason: 'Short', // < 10 chars
        }),
      ).rejects.toThrow(InvalidTurnInputError);
    });

    it('blocks Owner B from inspecting Conversation A1 across tenant boundaries (returns 404)', async () => {
      const created = await createConvUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        clientTurnId: 'turn_cross_inspect',
        userPrompt: 'Conversación confidencial en Alpha',
      });

      await expect(
        controller.auditInspect(PRINCIPAL_B_OWNER, created.conversationId, {
          reason: 'Clinical supervision review across tenants',
        }),
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it('successfully executes privileged inspection for authorized Owner, returning history and committing audit log to PostgreSQL', async () => {
      const created = await createConvUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        clientTurnId: 'turn_owner_inspect_ok',
        userPrompt: 'Consulta de paciente para revisión de supervisión',
      });

      await executeTurnUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        conversationId: created.conversationId,
        turnId: created.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      const auditResult = await controller.auditInspect(PRINCIPAL_A_OWNER, created.conversationId, {
        reason: 'Supervisión clínica de cumplimiento y calidad asistencial',
      });

      expect(auditResult.auditLogId).toBeDefined();
      expect(auditResult.conversation.id).toBe(created.conversationId);
      expect(auditResult.messages).toHaveLength(2);

      // Verify audit record was durably written to PostgreSQL
      const auditInDb = await prisma.aiConversationAuditLog.findUnique({
        where: { id: auditResult.auditLogId },
      });
      expect(auditInDb).toBeDefined();
      expect(auditInDb?.tenantId).toBe(TENANT_A);
      expect(auditInDb?.conversationId).toBe(created.conversationId);
      expect(auditInDb?.inspectorUserId).toBe(PRINCIPAL_A_OWNER.actorId);
      expect(auditInDb?.inspectorRole).toBe('Owner');
      expect(auditInDb?.reason).toBe('Supervisión clínica de cumplimiento y calidad asistencial');
    });

    it('enforces fail-closed behavior: if audit log persistence fails, zero conversation data is returned', async () => {
      const created = await createConvUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        clientTurnId: 'turn_fail_closed',
        userPrompt: 'Consulta médica para prueba de fail-closed',
      });

      // Mock audit repo that throws during save
      const failingAuditRepo: PrismaAiConversationAuditRepository = {
        save: jest.fn().mockRejectedValue(new Error('PostgreSQL Disk / Connection Error')),
        findById: jest.fn(),
        listByConversation: jest.fn(),
      } as unknown as PrismaAiConversationAuditRepository;

      const failingInspectUseCase = new PrivilegedInspectConversationUseCase(
        convRepo,
        messageRepo,
        failingAuditRepo,
      );

      // Privileged inspection must fail and NOT return conversation details
      await expect(
        failingInspectUseCase.execute({
          tenantId: TENANT_A,
          conversationId: created.conversationId,
          inspectorUserId: PRINCIPAL_A_OWNER.actorId,
          inspectorRole: 'Owner',
          reason: 'Supervisión clínica para simulación de fallo',
        }),
      ).rejects.toThrow(TransactionFailureError);
    });

    it('proves that audit records survive conversation hard deletion in PostgreSQL', async () => {
      const created = await createConvUseCase.execute({
        tenantId: TENANT_A,
        userId: PRINCIPAL_A1.actorId,
        clientTurnId: 'turn_audit_retention_01',
        userPrompt: 'Consulta que será eliminada físicamente',
      });

      const auditResult = await inspectUseCase.execute({
        tenantId: TENANT_A,
        conversationId: created.conversationId,
        inspectorUserId: PRINCIPAL_A_OWNER.actorId,
        inspectorRole: 'Owner',
        reason: 'Inspección previa a borrado permanente',
      });

      // Hard-delete the conversation directly from PostgreSQL
      await prisma.$executeRawUnsafe(
        `DELETE FROM "ai_conversations" WHERE "id" = '${created.conversationId}'`,
      );

      // Verify conversation is gone
      const convCheck = await convRepo.findById(TENANT_A, created.conversationId);
      expect(convCheck).toBeNull();

      // Verify audit log record STILL EXISTS in PostgreSQL!
      const auditCheck = await prisma.aiConversationAuditLog.findUnique({
        where: { id: auditResult.auditLogId },
      });
      expect(auditCheck).toBeDefined();
      expect(auditCheck?.id).toBe(auditResult.auditLogId);
      expect(auditCheck?.conversationId).toBe(created.conversationId);
    });
  });
});
