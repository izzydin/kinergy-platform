import { PrismaClient } from '@prisma/client';
import {
  CreateConversationWithInitialTurnUseCase,
  ReserveConversationTurnUseCase,
  ExecuteConversationTurnUseCase,
  GetConversationUseCase,
  ListConversationsUseCase,
  GetMessageHistoryUseCase,
  UpdateConversationTitleUseCase,
  ArchiveConversationUseCase,
  CancelConversationTurnUseCase,
  PrivilegedInspectConversationUseCase,
  PersistMessageStateUseCase,
  LoadCanonicalConversationHistoryUseCase,
  GenerationStatus,
  AiTurnErrorClassifier,
  TurnFailureCategory,
  DuplicateClientTurnPayloadMismatchError,
  ConversationNotFoundError,
  AiPayloadHasher,
  IRAGTurnPipelinePort,
  RAGTurnExecutionCommand,
  RAGTurnExecutionResult,
} from '@kinergy-platform/core';
import {
  PrismaAiConversationRepository,
  PrismaAiConversationTurnRepository,
  PrismaAiConversationMessageRepository,
  PrismaAiConversationAuditRepository,
  PrismaAiConversationTransactionRunner,
} from '@kinergy-platform/core/server';
import { ArgumentsHost } from '@nestjs/common';
import { AiConversationController } from '../conversation/ai-conversation.controller';
import { AiConversationResponseMapper } from '../conversation/mappers/ai-conversation-response.mapper';
import { TrustedAiContext } from '../conversation/decorators/trusted-ai-context.decorator';
import { CreateConversationRequestDto } from '../conversation/dtos/ai-conversation.dtos';
import { AiConversationExceptionFilter } from '../conversation/filters/ai-conversation-exception.filter';

/**
 * AI-09.3-BE.07.06 — Security Hardening & Regression Remediation Acceptance (PostgreSQL)
 *
 * Verifies against real PostgreSQL:
 * 1. Constraint `chk_terminal_attempt_no_active_lease` remediation and regression protection
 * 2. Sensitive information disclosure prevention (error classification, log sanitization, DTO stripping)
 * 3. Server-side tenant derivation & cross-tenant isolation enforcement
 * 4. Privileged inspection fail-closed audit log enforcement
 * 5. Fencing against superseded generation attempts
 * 6. Canonical payload hashing security & idempotent recovery
 */
describe('AI-09.3-BE.07.06: Security Hardening & Regression Remediation (PostgreSQL)', () => {
  let prisma: PrismaClient;
  let convRepo: PrismaAiConversationRepository;
  let turnRepo: PrismaAiConversationTurnRepository;
  let messageRepo: PrismaAiConversationMessageRepository;
  let auditRepo: PrismaAiConversationAuditRepository;
  let txRunner: PrismaAiConversationTransactionRunner;

  let createUseCase: CreateConversationWithInitialTurnUseCase;
  let reserveUseCase: ReserveConversationTurnUseCase;
  let executeUseCase: ExecuteConversationTurnUseCase;
  let inspectUseCase: PrivilegedInspectConversationUseCase;
  let persistUseCase: PersistMessageStateUseCase;
  let historyLoader: LoadCanonicalConversationHistoryUseCase;
  let controller: AiConversationController;

  const TENANT_A = 'tenant_hardening_alpha';
  const TENANT_B = 'tenant_hardening_beta';
  const USER_A = 'usr_hardening_01';
  const USER_OWNER = 'usr_hardening_owner';

  const PRINCIPAL_USER_A: TrustedAiContext = {
    actorId: USER_A,
    tenantId: TENANT_A,
    roles: ['Trainer'],
    permissions: [],
    email: 'user_a@kinergy.com',
  };

  const PRINCIPAL_OWNER_A: TrustedAiContext = {
    actorId: USER_OWNER,
    tenantId: TENANT_A,
    roles: ['Owner'],
    permissions: ['ai.conversations.audit'],
    email: 'owner_a@kinergy.com',
  };

  let onRagExecutionStarted: (() => Promise<void>) | null = null;

  const mockRagPipeline: IRAGTurnPipelinePort = {
    executeTurn: jest
      .fn()
      .mockImplementation(
        async (command: RAGTurnExecutionCommand): Promise<RAGTurnExecutionResult> => {
          if (onRagExecutionStarted) {
            await onRagExecutionStarted();
          }

          return {
            outcome: 'SUCCESS',
            content: `Hardened response for prompt: ${command.userPrompt}`,
            isGrounded: true,
            sources: [
              {
                documentId: 'doc_hardening_verified',
                documentTitle: 'Protocolo de Seguridad y Fencing',
                chunkId: 'chk_hard_01',
                relevanceScore: 0.99,
                pageNumber: 1,
                headingPath: ['Seguridad', 'Hardening'],
              },
            ],
            metadata: {
              model: 'hardened-model-v1',
              retrievalCount: 1,
              latencyMs: 25,
              totalTokens: 95,
            },
          };
        },
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

    persistUseCase = new PersistMessageStateUseCase(messageRepo);
    historyLoader = new LoadCanonicalConversationHistoryUseCase(convRepo, turnRepo, messageRepo);

    executeUseCase = new ExecuteConversationTurnUseCase(
      convRepo,
      turnRepo,
      messageRepo,
      persistUseCase,
      mockRagPipeline,
      historyLoader,
      txRunner,
    );

    createUseCase = new CreateConversationWithInitialTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      undefined,
    );

    reserveUseCase = new ReserveConversationTurnUseCase(
      txRunner,
      turnRepo,
      convRepo,
      messageRepo,
      undefined,
      undefined,
    );

    inspectUseCase = new PrivilegedInspectConversationUseCase(convRepo, messageRepo, auditRepo);

    controller = new AiConversationController(
      createUseCase,
      reserveUseCase,
      null as unknown as GetConversationUseCase,
      null as unknown as ListConversationsUseCase,
      null as unknown as GetMessageHistoryUseCase,
      null as unknown as UpdateConversationTitleUseCase,
      null as unknown as ArchiveConversationUseCase,
      inspectUseCase,
      null as unknown as CancelConversationTurnUseCase,
    );
  });

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "tenant_id" IN ('${TENANT_A}', '${TENANT_B}')`,
    );
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    onRagExecutionStarted = null;
    jest.clearAllMocks();
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "tenant_id" IN ('${TENANT_A}', '${TENANT_B}')`,
    );
  });

  // =========================================================================
  // REMEDIATION 1: chk_terminal_attempt_no_active_lease Constraint Compliance
  // =========================================================================
  describe('Remediation 1: chk_terminal_attempt_no_active_lease Constraint Compliance', () => {
    it('verifies that transitioning an attempt with an active lease to SUCCESS clears lease fields and satisfies PostgreSQL check constraint', async () => {
      const created = await createUseCase.execute({
        tenantId: TENANT_A,
        userId: USER_A,
        clientTurnId: 'turn_lease_clear_success',
        userPrompt: 'Test lease clearing on SUCCESS',
      });

      // 1. Manually simulate an active lease on the message (as if leased to a worker)
      await prisma.aiConversationMessage.update({
        where: { id: created.assistantAttemptId },
        data: {
          status: 'STREAMING',
          leaseToken: 'lease_tok_active_123',
          leaseOwnerInstanceId: 'worker_pod_01',
          leaseExpiresAt: new Date(Date.now() + 60_000),
        },
      });

      // 2. Transition message to SUCCESS via PersistMessageStateUseCase
      await persistUseCase.execute({
        tenantId: TENANT_A,
        conversationId: created.conversationId,
        messageId: created.assistantAttemptId,
        status: GenerationStatus.SUCCESS,
        content: 'Completed clinical response with cleared lease.',
        isCanonical: true,
        completedAt: new Date(),
      });

      // 3. PostgreSQL Database Assertions: check constraint chk_terminal_attempt_no_active_lease must hold
      const inDbMessage = await prisma.aiConversationMessage.findUnique({
        where: { id: created.assistantAttemptId },
      });

      expect(inDbMessage?.status).toBe('SUCCESS');
      expect(inDbMessage?.leaseToken).toBeNull();
      expect(inDbMessage?.leaseOwnerInstanceId).toBeNull();
      expect(inDbMessage?.leaseExpiresAt).toBeNull();
    });

    it('verifies that transitioning an attempt with an active lease to FAILED clears lease fields and satisfies PostgreSQL check constraint', async () => {
      const created = await createUseCase.execute({
        tenantId: TENANT_A,
        userId: USER_A,
        clientTurnId: 'turn_lease_clear_failed',
        userPrompt: 'Test lease clearing on FAILED',
      });

      // 1. Active lease on STREAMING attempt
      await prisma.aiConversationMessage.update({
        where: { id: created.assistantAttemptId },
        data: {
          status: 'STREAMING',
          leaseToken: 'lease_tok_failed_test',
          leaseOwnerInstanceId: 'worker_pod_02',
          leaseExpiresAt: new Date(Date.now() + 60_000),
        },
      });

      // 2. Transition message to FAILED via PersistMessageStateUseCase
      await persistUseCase.execute({
        tenantId: TENANT_A,
        conversationId: created.conversationId,
        messageId: created.assistantAttemptId,
        status: GenerationStatus.FAILED,
        errorCode: 'PROVIDER_TIMEOUT',
        errorMessage: 'LLM timed out',
        completedAt: new Date(),
      });

      // 3. Verify PostgreSQL row
      const inDbMessage = await prisma.aiConversationMessage.findUnique({
        where: { id: created.assistantAttemptId },
      });

      expect(inDbMessage?.status).toBe('FAILED');
      expect(inDbMessage?.leaseToken).toBeNull();
      expect(inDbMessage?.leaseOwnerInstanceId).toBeNull();
      expect(inDbMessage?.leaseExpiresAt).toBeNull();
    });

    it('verifies that raw DB attempts to set a lease on a terminal message fail PostgreSQL constraint chk_terminal_attempt_no_active_lease', async () => {
      const created = await createUseCase.execute({
        tenantId: TENANT_A,
        userId: USER_A,
        clientTurnId: 'turn_raw_constraint_test',
        userPrompt: 'Raw check constraint enforcement',
      });

      // Transition to terminal SUCCESS cleanly first
      await persistUseCase.execute({
        tenantId: TENANT_A,
        conversationId: created.conversationId,
        messageId: created.assistantAttemptId,
        status: GenerationStatus.SUCCESS,
        content: 'Final content',
        isCanonical: true,
      });

      // Attempt raw SQL update setting an active lease on a SUCCESS message: PostgreSQL must reject with 23514
      await expect(
        prisma.$executeRawUnsafe(`
          UPDATE "ai_conversation_messages"
          SET "lease_token" = 'forbidden_lease'
          WHERE "id" = '${created.assistantAttemptId}'
        `),
      ).rejects.toThrow(/23514|chk_terminal_attempt_no_active_lease/i);
    });
  });

  // =========================================================================
  // REMEDIATION 2: Sensitive Information Disclosure & Sanitization
  // =========================================================================
  describe('Remediation 2: Sensitive Information Disclosure & Sanitization', () => {
    it('verifies that database exceptions with connection strings and credentials are sanitized by AiTurnErrorClassifier', () => {
      const sensitiveError = new Error(
        'Connection terminated: postgresql://admin:superSecretP@ss!@pg-cluster.internal:5432/kinergy_db?sslmode=require',
      );

      const classified = AiTurnErrorClassifier.classify(sensitiveError);

      expect(classified.sanitizedErrorMessage).not.toContain('superSecretP@ss!');
      expect(classified.sanitizedErrorMessage).not.toContain('pg-cluster.internal');
      expect(classified.sanitizedErrorMessage).not.toContain('postgresql://');
      expect(classified.category).toBe(TurnFailureCategory.RETRIEVAL_FAILURE);
      expect(classified.errorCode).toBe('RETRIEVAL_DATABASE_ERROR');
    });

    it('verifies that AiConversationExceptionFilter strips internal stack traces and Prisma internals from HTTP responses', () => {
      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn(),
      };
      const mockHost = {
        switchToHttp: () => ({
          getResponse: () => mockResponse,
          getRequest: () => ({ url: '/api/v1/ai/conversations' }),
        }),
      };

      const filter = new AiConversationExceptionFilter();
      const internalPrismaError = new Error(
        'Invalid `prisma.aiConversationTurn.findMany()` invocation: SELECT * FROM "ai_conversation_turns" WHERE ... table locked by 08006',
      );

      filter.catch(internalPrismaError, mockHost as unknown as ArgumentsHost);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      const jsonCall = mockResponse.json.mock.calls[0][0];

      expect(jsonCall.statusCode).toBe(500);
      expect(jsonCall.error).toBe('Internal Server Error');
      expect(jsonCall.code).toBe('AI_INTERNAL_ERROR');
      expect(jsonCall.message).toBe(
        'An unexpected error occurred during AI conversation processing.',
      );
      // Zero leak of SQL or internal query text
      expect(JSON.stringify(jsonCall)).not.toContain('SELECT *');
      expect(JSON.stringify(jsonCall)).not.toContain('08006');
    });

    it('verifies that response DTO mappers omit internal implementation fields (hashes, lease tokens, transaction IDs)', async () => {
      const created = await createUseCase.execute({
        tenantId: TENANT_A,
        userId: USER_A,
        clientTurnId: 'turn_dto_sanitization_01',
        userPrompt: 'Verificar omisión estricta de metadatos internos',
      });

      const responseDto = AiConversationResponseMapper.toCreateConversationResponse(created);
      const rawDto = responseDto as unknown as Record<string, unknown>;

      // Explicitly check absence of sensitive persistence internals
      expect(rawDto).not.toHaveProperty('idempotencyPayloadHash');
      expect(rawDto).not.toHaveProperty('leaseToken');
      expect(rawDto).not.toHaveProperty('leaseOwnerInstanceId');
      expect(rawDto).not.toHaveProperty('leaseExpiresAt');
      expect(rawDto).not.toHaveProperty('txId');
      expect(rawDto).not.toHaveProperty('prismaId');

      // Canonical identifiers are present
      expect(responseDto.conversationId).toBe(created.conversationId);
      expect(responseDto.turnId).toBe(created.turnId);
      expect(responseDto.clientTurnId).toBe('turn_dto_sanitization_01');
    });
  });

  // =========================================================================
  // REMEDIATION 3: Tenant Isolation & Server-Side Identity Derivation
  // =========================================================================
  describe('Remediation 3: Tenant Isolation & Server-Side Identity Derivation', () => {
    it('verifies that client cannot spoof tenant by passing clientTurnId or prompt into another tenant', async () => {
      // Create conversation in Tenant A
      const convA = await createUseCase.execute({
        tenantId: TENANT_A,
        userId: USER_A,
        clientTurnId: 'turn_tenant_iso_01',
        userPrompt: 'Diagnóstico clínico en Tenant A',
      });

      // Tenant B actor attempts to reserve a turn on Tenant A conversation
      await expect(
        reserveUseCase.execute({
          tenantId: TENANT_B, // Authenticated as Tenant B
          userId: 'usr_malicious_b',
          conversationId: convA.conversationId, // Target Tenant A
          clientTurnId: 'turn_spoof_attempt_01',
          userPrompt: 'Intrusión no autorizada',
        }),
      ).rejects.toThrow(ConversationNotFoundError);

      // Verify no turn was created on Tenant A's conversation
      const turns = await prisma.aiConversationTurn.findMany({
        where: { conversationId: convA.conversationId },
      });
      expect(turns).toHaveLength(1);
    });

    it('verifies that controller strictly derives tenantId from TrustedAiContext decorator, ignoring request bodies', async () => {
      const reqDto: CreateConversationRequestDto & { tenantId?: string } = {
        clientTurnId: 'turn_ctrl_tenant_derive',
        userPrompt: 'Consulta clínica desde controlador',
        title: 'Verificación de Contexto',
        tenantId: 'FORGED_TENANT_ID', // Attacker injects forged tenantId in JSON body!
      };

      const result = await controller.createConversation(PRINCIPAL_USER_A, reqDto);

      // Verify created in TENANT_A, NOT FORGED_TENANT_ID
      const inDbConv = await prisma.aiConversation.findUnique({
        where: { id: result.conversationId },
      });
      expect(inDbConv?.tenantId).toBe(TENANT_A);
      expect(inDbConv?.tenantId).not.toBe('FORGED_TENANT_ID');
    });
  });

  // =========================================================================
  // REMEDIATION 4: Privileged Inspection Fail-Closed Audit Enforcement
  // =========================================================================
  describe('Remediation 4: Privileged Inspection Fail-Closed Audit Enforcement', () => {
    it('commits an immutable audit record when authorized Owner inspects conversation', async () => {
      const created = await createUseCase.execute({
        tenantId: TENANT_A,
        userId: USER_A,
        clientTurnId: 'turn_inspect_valid_01',
        userPrompt: 'Historia clínica de rehabilitación',
        title: 'Supervisión de Caso',
      });

      const inspectResult = await controller.auditInspect(
        PRINCIPAL_OWNER_A,
        created.conversationId,
        { reason: 'Supervisión de calidad asistencial y seguridad clínica' },
      );

      expect(inspectResult.auditLogId).toBeDefined();
      expect(inspectResult.conversation.id).toBe(created.conversationId);

      // Verify audit record in PostgreSQL
      const auditLog = await prisma.aiConversationAuditLog.findUnique({
        where: { id: inspectResult.auditLogId },
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog?.tenantId).toBe(TENANT_A);
      expect(auditLog?.conversationId).toBe(created.conversationId);
      expect(auditLog?.inspectorUserId).toBe(USER_OWNER);
      expect(auditLog?.reason).toBe('Supervisión de calidad asistencial y seguridad clínica');
    });

    it('fails closed and returns zero conversation data if audit log persistence fails', async () => {
      const created = await createUseCase.execute({
        tenantId: TENANT_A,
        userId: USER_A,
        clientTurnId: 'turn_inspect_fail_closed',
        userPrompt: 'Datos sensibles no divulgables',
      });

      // Mock audit repo where save throws a database error
      const failingAuditRepo = {
        save: jest.fn().mockRejectedValue(new Error('Audit table disk full or connection dropped')),
        listByConversation: jest.fn(),
      };

      const failClosedInspectUseCase = new PrivilegedInspectConversationUseCase(
        convRepo,
        messageRepo,
        failingAuditRepo as unknown as PrismaAiConversationAuditRepository,
      );

      // Must throw and fail closed: caller receives an error and NO conversation data is returned
      await expect(
        failClosedInspectUseCase.execute({
          tenantId: TENANT_A,
          conversationId: created.conversationId,
          inspectorUserId: USER_OWNER,
          inspectorRole: 'Owner',
          reason: 'Auditoría obligatoria de control',
        }),
      ).rejects.toThrow('Audit table disk full');
    });
  });

  // =========================================================================
  // REMEDIATION 5: Transactional Fencing Against Stale Generation Attempts
  // =========================================================================
  describe('Remediation 5: Transactional Fencing Against Stale Generation Attempts', () => {
    it('prevents a superseded worker from overwriting canonical answer during finalization race', async () => {
      const created = await createUseCase.execute({
        tenantId: TENANT_A,
        userId: USER_A,
        clientTurnId: 'turn_fencing_hardened_01',
        userPrompt: 'Plan de ejercicios de estabilidad de core',
      });

      // Simulate: Worker A starts inference on attempt 1.
      // While Worker A is in inference, another worker/coordinator supersedes attempt 1 by bumping activeAttemptNumber in PostgreSQL
      onRagExecutionStarted = async () => {
        await prisma.aiConversationTurn.update({
          where: {
            uq_turn_id_conv_tenant: {
              id: created.turnId,
              conversationId: created.conversationId,
              tenantId: TENANT_A,
            },
          },
          data: {
            activeAttemptNumber: 2, // Reassigned to attempt 2
          },
        });
      };

      // Worker A attempts to finalize attempt 1
      const staleResult = await executeUseCase.execute({
        tenantId: TENANT_A,
        userId: USER_A,
        conversationId: created.conversationId,
        turnId: created.turnId,
        actorContext: { roles: ['Trainer'], permissions: [] },
      });

      // Fencing must catch the superseded attempt and abort!
      expect(staleResult.isCanonical).toBe(false);
      expect(staleResult.outcome).toBe('FAILED');
      expect(staleResult.errorCode).toBe('ATTEMPT_SUPERSEDED');

      // Database assertion: Zero canonical assistant messages exist in PostgreSQL
      const messages = await messageRepo.listByTurn(
        TENANT_A,
        created.conversationId,
        created.turnId,
      );
      expect(messages.filter((m) => m.isCanonical)).toHaveLength(0);
    });
  });

  // =========================================================================
  // REMEDIATION 6: Canonical Payload Hashing & Idempotency Hardening
  // =========================================================================
  describe('Remediation 6: Canonical Payload Hashing & Idempotency Hardening', () => {
    it('computes identical payload hashes across differing CRLF newline styles and whitespace padding', () => {
      const basePrompt = 'Protocolo de readaptación funcional';
      const hashLf = AiPayloadHasher.hash({ prompt: `${basePrompt}\n` });
      const hashCrlf = AiPayloadHasher.hash({ prompt: `${basePrompt}\r\n` });
      const hashPadded = AiPayloadHasher.hash({ prompt: `  ${basePrompt}  \r\n` });

      expect(hashLf).toBe(hashCrlf);
      expect(hashCrlf).toBe(hashPadded);
      expect(hashLf).toHaveLength(64);
    });

    it('rejects retries with identical clientTurnId but differing prompt payload with 409 Conflict', async () => {
      const clientTurnId = 'turn_conflict_hardening_01';

      // First submission
      await createUseCase.execute({
        tenantId: TENANT_A,
        userId: USER_A,
        clientTurnId,
        userPrompt: 'Prompt original seguro',
      });

      // Conflicting submission
      await expect(
        createUseCase.execute({
          tenantId: TENANT_A,
          userId: USER_A,
          clientTurnId,
          userPrompt: 'Prompt alterado maliciosamente',
        }),
      ).rejects.toThrow(DuplicateClientTurnPayloadMismatchError);
    });
  });
});
