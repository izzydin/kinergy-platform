import {
  ExecutionContext,
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { FeedbackRating, PrismaClient, VisibilityScope } from '@prisma/client';
import request from 'supertest';
import { AuthenticationGuard } from '../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../platform/identity/authorization/authorization.guard';
import { AuthenticatedUserContext } from '../../platform/identity/context/authenticated-user-context';
import { UserStatus } from '../../platform/identity/domain';
import { OBJECT_STORAGE_PORT } from '../../platform/storage/ports/object-storage.port';
import { AiConversationModule } from '../conversation/ai-conversation.module';
import { AiConversationExceptionFilter } from '../conversation/filters/ai-conversation-exception.filter';

/**
 * AI-09.10 — IT.07: Backend Integration and API Contract Tests
 *
 * Comprehensive integration suite verifying:
 * 1. Wire HTTP API contracts with live ValidationPipe DTO validation and response shapes.
 * 2. Authentication & Authorization Guard Matrix (401 without token, 403 for role mismatch, 200/201 for valid actor).
 * 3. Conversation & message persistence on live PostgreSQL with keyset pagination.
 * 4. Turn reservation, idempotency replay, and concurrency locking (409 AI_TURN_ALREADY_IN_PROGRESS).
 * 5. Message feedback lifecycle (submission, update/upsert, retrieval, revocation, target role validation).
 * 6. Turn regeneration contract (attempt progression, non-canonical preservation, active turn rejection).
 * 7. Citation retrieval & cryptographic preview token streaming with nosniff headers.
 * 8. Error and security contracts (correlation headers, uniform schema, zero stack trace or SQL leakage).
 * 9. Multi-tenant IDOR protection (Tenant Beta rejected with 404 on Tenant Alpha resources).
 */
describe('AI-09.10 — IT.07: Backend Integration & API Contract Tests (PostgreSQL)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  const TENANT_ALPHA = 'tenant_it07_alpha';
  const TENANT_BETA = 'tenant_it07_beta';
  const USER_ALPHA_DOC = 'usr_it07_doc_01';
  const USER_ALPHA_OWNER = 'usr_it07_owner_01';
  const USER_BETA_DOC = 'usr_it07_beta_doc';

  interface TestUser {
    userId: string;
    email: string;
    status: UserStatus;
    roles: string[];
    permissions: string[];
    tenantId: string;
  }

  let currentTestUser: TestUser | null = null;

  const doctorAlpha: TestUser = {
    userId: USER_ALPHA_DOC,
    email: 'doc.alpha@kinergy.test',
    status: UserStatus.ACTIVE,
    roles: ['Physiotherapist', 'Doctor'],
    permissions: ['ai:read', 'ai:write'],
    tenantId: TENANT_ALPHA,
  };

  const ownerAlpha: TestUser = {
    userId: USER_ALPHA_OWNER,
    email: 'owner.alpha@kinergy.test',
    status: UserStatus.ACTIVE,
    roles: ['Owner'],
    permissions: ['ai:read', 'ai:write', 'ai.conversations.audit'],
    tenantId: TENANT_ALPHA,
  };

  const doctorBeta: TestUser = {
    userId: USER_BETA_DOC,
    email: 'doc.beta@kinergy.test',
    status: UserStatus.ACTIVE,
    roles: ['Physiotherapist', 'Doctor'],
    permissions: ['ai:read', 'ai:write'],
    tenantId: TENANT_BETA,
  };

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();

    const mockStoragePort = {
      exists: jest.fn().mockResolvedValue(true),
      download: jest.fn().mockResolvedValue({
        data: Buffer.from('%PDF-1.4 test document content for inline preview'),
        metadata: {
          key: 'docs/ver_acl_v1',
          tenantId: TENANT_ALPHA,
          domainFolder: 'knowledge_base',
          filename: 'guia-lca.pdf',
          mimeType: 'application/pdf',
          sizeBytes: 52,
          createdAt: new Date(),
          lastModified: new Date(),
        },
      }),
      upload: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue(undefined),
      getMetadata: jest.fn(),
      createPresignedDownloadUrl: jest.fn(),
      createPresignedUploadUrl: jest.fn(),
    };

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AiConversationModule],
    })
      .overrideGuard(AuthenticationGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const reflector = new Reflector();
          const isPublic = reflector.getAllAndOverride<boolean>('isPublic', [
            context.getHandler(),
            context.getClass(),
          ]);
          if (isPublic) {
            return true;
          }

          const req = context.switchToHttp().getRequest();
          const authHeader = req.headers['authorization'];
          if (!authHeader) {
            throw new UnauthorizedException('Authentication credentials are missing or invalid.');
          }
          if (authHeader === 'Bearer invalid_token' || authHeader === 'Bearer expired_token') {
            throw new UnauthorizedException('Authentication credentials are missing or invalid.');
          }
          const user = currentTestUser;
          if (user) {
            req.user = new AuthenticatedUserContext({
              userId: user.userId,
              email: user.email,
              status: user.status,
              roles: user.roles,
              permissions: user.permissions,
              tenantId: user.tenantId,
            });
            return true;
          }
          throw new UnauthorizedException('Authenticated user not found.');
        },
      })
      .overrideGuard(AuthorizationGuard)
      .useValue({
        canActivate: (context: ExecutionContext) => {
          const reflector = new Reflector();
          const isPublic = reflector.getAllAndOverride<boolean>('isPublic', [
            context.getHandler(),
            context.getClass(),
          ]);
          if (isPublic) {
            return true;
          }

          const requiredRoles = reflector.getAllAndOverride<string[]>('roles', [
            context.getHandler(),
            context.getClass(),
          ]);
          const user = currentTestUser;
          if (requiredRoles && requiredRoles.length > 0) {
            if (!user || !requiredRoles.some((r) => user.roles.includes(r))) {
              throw new ForbiddenException('Insufficient role permissions.');
            }
          }
          return true;
        },
      })
      .overrideProvider(OBJECT_STORAGE_PORT)
      .useValue(mockStoragePort)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    app.useGlobalFilters(new AiConversationExceptionFilter());
    await app.init();
  });

  async function cleanupDatabase() {
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_message_feedback" WHERE "tenant_id" IN ('${TENANT_ALPHA}', '${TENANT_BETA}')`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversation_citations" WHERE "tenant_id" IN ('${TENANT_ALPHA}', '${TENANT_BETA}')`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversation_audit_logs" WHERE "tenant_id" IN ('${TENANT_ALPHA}', '${TENANT_BETA}')`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "ai_conversations" WHERE "tenant_id" IN ('${TENANT_ALPHA}', '${TENANT_BETA}')`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "knowledge_chunks" WHERE "tenant_id" IN ('${TENANT_ALPHA}', '${TENANT_BETA}')`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "document_versions" WHERE "document_id" IN (SELECT "id" FROM "knowledge_documents" WHERE "tenant_id" IN ('${TENANT_ALPHA}', '${TENANT_BETA}'))`,
    );
    await prisma.$executeRawUnsafe(
      `DELETE FROM "knowledge_documents" WHERE "tenant_id" IN ('${TENANT_ALPHA}', '${TENANT_BETA}')`,
    );
  }

  afterAll(async () => {
    await cleanupDatabase();
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    currentTestUser = doctorAlpha;
    await cleanupDatabase();
  });

  // =========================================================================
  // 1. Authentication and Authorization Guard Matrix (Task 6)
  // =========================================================================
  describe('1. Authentication and Authorization Guard Matrix', () => {
    it('rejects unauthenticated request with 401 Unauthorized when Authorization header is missing', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ai/conversations')
        .send({
          clientTurnId: 'turn_unauth_01',
          userPrompt: 'Formulate a plan',
        })
        .expect(401);

      expect(res.body.message).toMatch(/Authentication credentials are missing or invalid/i);
      expect(res.body.statusCode).toBe(401);
      expect(res.headers['x-correlation-id']).toBeDefined();
    });

    it('rejects request with 401 Unauthorized when bearer token is invalid or expired', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ai/conversations')
        .set('Authorization', 'Bearer invalid_token')
        .send({
          clientTurnId: 'turn_invalid_tok_01',
          userPrompt: 'Formulate a plan',
        })
        .expect(401);

      expect(res.body.message).toMatch(/Authentication credentials are missing or invalid/i);
    });

    it('rejects privileged audit inspection with 403 Forbidden when user lacks Owner role', async () => {
      // 1. Create a conversation as Doctor
      currentTestUser = doctorAlpha;
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/ai/conversations')
        .set('Authorization', 'Bearer valid_token')
        .send({
          clientTurnId: 'turn_priv_01',
          userPrompt: 'Confidential clinical protocol query',
        })
        .expect(201);

      const convId = createRes.body.conversationId;

      // 2. Doctor attempts to call audit inspection (requires @Roles('Owner'))
      const inspectRes = await request(app.getHttpServer())
        .post(`/api/v1/ai/conversations/${convId}/audit-inspect`)
        .set('Authorization', 'Bearer valid_token')
        .send({ reason: 'Doctor attempting privileged inspection' })
        .expect(403);

      expect(inspectRes.body.message).toMatch(/Insufficient role permissions/i);

      // Verify zero audit logs created
      const count = await prisma.aiConversationAuditLog.count({
        where: { conversationId: convId },
      });
      expect(count).toBe(0);
    });

    it('allows privileged audit inspection when user has Owner role and writes audit log to PostgreSQL', async () => {
      // 1. Create conversation as Doctor
      currentTestUser = doctorAlpha;
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/ai/conversations')
        .set('Authorization', 'Bearer valid_token')
        .send({
          clientTurnId: 'turn_priv_owner_01',
          userPrompt: 'Clinical session protocol',
        })
        .expect(201);

      const convId = createRes.body.conversationId;

      // 2. Switch to Owner
      currentTestUser = ownerAlpha;
      const inspectRes = await request(app.getHttpServer())
        .post(`/api/v1/ai/conversations/${convId}/audit-inspect`)
        .set('Authorization', 'Bearer valid_token')
        .send({ reason: 'Clinical oversight audit #8092' })
        .expect(200);

      expect(inspectRes.body.auditLogId).toBeDefined();
      expect(inspectRes.body.conversation.id).toBe(convId);

      // Verify PostgreSQL record
      const auditLog = await prisma.aiConversationAuditLog.findUnique({
        where: { id: inspectRes.body.auditLogId },
      });
      expect(auditLog).not.toBeNull();
      expect(auditLog?.inspectorRole).toBe('Owner');
      expect(auditLog?.reason).toBe('Clinical oversight audit #8092');
    });
  });

  // =========================================================================
  // 2. API Contract & DTO Validation (Task 1)
  // =========================================================================
  describe('2. API Contract & DTO Validation', () => {
    it('validates request payload and rejects empty userPrompt with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ai/conversations')
        .set('Authorization', 'Bearer valid_token')
        .send({
          clientTurnId: 'turn_val_01',
          userPrompt: '    ', // whitespace only
        })
        .expect(400);

      expect(res.body.statusCode).toBe(400);
      expect(res.body.message).toBeDefined();
    });

    it('validates request payload and rejects missing clientTurnId with 400 Bad Request', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/ai/conversations')
        .set('Authorization', 'Bearer valid_token')
        .send({
          userPrompt: 'Valid prompt without client turn identifier',
        })
        .expect(400);

      expect(res.body.statusCode).toBe(400);
    });

    it('creates conversation and returns authoritative DTO contract shape with 201 Created', async () => {
      const clientTurnId = `ct_contract_${Date.now()}`;
      const res = await request(app.getHttpServer())
        .post('/api/v1/ai/conversations')
        .set('Authorization', 'Bearer valid_token')
        .send({
          clientTurnId,
          userPrompt: 'Plan de fortalecimiento excéntrico de cuádriceps',
          title: 'Fortalecimiento Excéntrico',
        })
        .expect(201);

      expect(res.body).toMatchObject({
        conversationId: expect.any(String),
        turnId: expect.any(String),
        clientTurnId,
        turnIndex: 1,
        turnStatus: 'PENDING',
        isIdempotentReplay: false,
        idempotencyOutcome: 'CREATED',
        createdAt: expect.any(String),
      });

      // Verify exact PostgreSQL state
      const dbConv = await prisma.aiConversation.findUnique({
        where: { id: res.body.conversationId },
      });
      expect(dbConv?.turnCounter).toBe(1);
      expect(dbConv?.messageCounter).toBe(2);
    });

    it('lists conversations and returns paginated response contract', async () => {
      // Seed 2 conversations
      await request(app.getHttpServer())
        .post('/api/v1/ai/conversations')
        .set('Authorization', 'Bearer valid_token')
        .send({ clientTurnId: 'turn_l1', userPrompt: 'Query 1', title: 'Conversation 1' });

      await request(app.getHttpServer())
        .post('/api/v1/ai/conversations')
        .set('Authorization', 'Bearer valid_token')
        .send({ clientTurnId: 'turn_l2', userPrompt: 'Query 2', title: 'Conversation 2' });

      const res = await request(app.getHttpServer())
        .get('/api/v1/ai/conversations?limit=10')
        .set('Authorization', 'Bearer valid_token')
        .expect(200);

      expect(res.body.items).toHaveLength(2);
      expect(res.body.hasMore).toBe(false);
      expect(res.body.nextCursor).toBeNull();
      expect(res.body.items[0]).toHaveProperty('id');
      expect(res.body.items[0]).toHaveProperty('title');
      expect(res.body.items[0]).toHaveProperty('createdAt');
    });

    it('updates conversation title and returns updated DTO contract', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/ai/conversations')
        .set('Authorization', 'Bearer valid_token')
        .send({ clientTurnId: 'turn_upd_01', userPrompt: 'Initial prompt', title: 'Old Title' })
        .expect(201);

      const convId = createRes.body.conversationId;

      const patchRes = await request(app.getHttpServer())
        .patch(`/api/v1/ai/conversations/${convId}/title`)
        .set('Authorization', 'Bearer valid_token')
        .send({ title: 'New Authoritative Title' })
        .expect(200);

      expect(patchRes.body.title).toBe('New Authoritative Title');
      expect(patchRes.body.conversationId).toBe(convId);
    });

    it('archives conversation and returns archival confirmation contract', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/ai/conversations')
        .set('Authorization', 'Bearer valid_token')
        .send({ clientTurnId: 'turn_arch_01', userPrompt: 'Prompt to archive' })
        .expect(201);

      const convId = createRes.body.conversationId;

      // Mark turn completed so conversation can be archived
      await prisma.aiConversationTurn.updateMany({
        where: { conversationId: convId },
        data: { status: 'COMPLETED' },
      });
      await prisma.aiConversationMessage.updateMany({
        where: { conversationId: convId, role: 'ASSISTANT' },
        data: { status: 'SUCCESS' },
      });

      const delRes = await request(app.getHttpServer())
        .delete(`/api/v1/ai/conversations/${convId}`)
        .set('Authorization', 'Bearer valid_token')
        .expect(200);

      expect(delRes.body.isArchived).toBe(true);
      expect(delRes.body.conversationId).toBe(convId);

      // Verify soft deletion in PostgreSQL
      const dbConv = await prisma.aiConversation.findUnique({
        where: { id: convId },
      });
      expect(dbConv?.deletedAt).not.toBeNull();
    });
  });

  // =========================================================================
  // 3. Message Feedback API Contract & PostgreSQL Persistence (Task 1, Task 4)
  // =========================================================================
  describe('3. Message Feedback Contract & PostgreSQL Persistence', () => {
    it('rejects feedback targeting a USER message with 400 Bad Request', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/ai/conversations')
        .set('Authorization', 'Bearer valid_token')
        .send({ clientTurnId: 'turn_fb_user_01', userPrompt: 'User prompt' })
        .expect(201);

      const convId = createRes.body.conversationId;

      const userMsg = await prisma.aiConversationMessage.findFirst({
        where: { conversationId: convId, role: 'USER' },
      });
      expect(userMsg).not.toBeNull();

      const res = await request(app.getHttpServer())
        .post(`/api/v1/ai/conversations/${convId}/messages/${userMsg?.id}/feedback`)
        .set('Authorization', 'Bearer valid_token')
        .send({ rating: 'POSITIVE', explanation: 'Great prompt' })
        .expect(400);

      expect(res.body.message).toMatch(/Feedback is only accepted for assistant responses/i);
    });

    it('submits, updates (upserts), retrieves, and revokes feedback on ASSISTANT message', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/ai/conversations')
        .set('Authorization', 'Bearer valid_token')
        .send({ clientTurnId: 'turn_fb_full_01', userPrompt: 'Explain PNF stretching' })
        .expect(201);

      const convId = createRes.body.conversationId;

      // Mark assistant message completed
      const asstMsg = await prisma.aiConversationMessage.findFirst({
        where: { conversationId: convId, role: 'ASSISTANT' },
      });
      expect(asstMsg).not.toBeNull();
      const asstMsgId = asstMsg!.id;

      await prisma.aiConversationMessage.update({
        where: { id: asstMsgId },
        data: { status: 'SUCCESS', content: 'PNF involves hold-relax techniques.' },
      });

      // 1. Submit POSITIVE feedback
      const submitRes = await request(app.getHttpServer())
        .post(`/api/v1/ai/conversations/${convId}/messages/${asstMsgId}/feedback`)
        .set('Authorization', 'Bearer valid_token')
        .send({
          rating: 'POSITIVE',
          explanation: 'Very clear explanation with precise biophysical guidelines.',
          category: 'ACCURATE',
        })
        .expect(200);

      expect(submitRes.body.rating).toBe('POSITIVE');
      expect(submitRes.body.explanation).toBe(
        'Very clear explanation with precise biophysical guidelines.',
      );
      expect(submitRes.body.messageId).toBe(asstMsgId);

      // Verify PostgreSQL persistence
      const dbFeedback = await prisma.aiMessageFeedback.findFirst({
        where: { messageId: asstMsgId },
      });
      expect(dbFeedback?.rating).toBe(FeedbackRating.POSITIVE);

      // 2. Retrieve feedback via GET
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/ai/conversations/${convId}/messages/${asstMsgId}/feedback`)
        .set('Authorization', 'Bearer valid_token')
        .expect(200);

      expect(getRes.body.rating).toBe('POSITIVE');
      expect(getRes.body.explanation).toBe(
        'Very clear explanation with precise biophysical guidelines.',
      );

      // 3. Upsert / update feedback to NEGATIVE
      const updateRes = await request(app.getHttpServer())
        .post(`/api/v1/ai/conversations/${convId}/messages/${asstMsgId}/feedback`)
        .set('Authorization', 'Bearer valid_token')
        .send({
          rating: 'NEGATIVE',
          explanation: 'Correction: needed more contraindications.',
        })
        .expect(200);

      expect(updateRes.body.rating).toBe('NEGATIVE');

      // 4. Revoke feedback via DELETE
      const revokeRes = await request(app.getHttpServer())
        .delete(`/api/v1/ai/conversations/${convId}/messages/${asstMsgId}/feedback`)
        .set('Authorization', 'Bearer valid_token')
        .expect(200);

      expect(revokeRes.body.revoked).toBe(true);

      // 5. Subsequent GET returns 404
      await request(app.getHttpServer())
        .get(`/api/v1/ai/conversations/${convId}/messages/${asstMsgId}/feedback`)
        .set('Authorization', 'Bearer valid_token')
        .expect(404);
    });
  });

  // =========================================================================
  // 4. Turn Regeneration Contract & PostgreSQL Attempt Progression (Task 1, Task 3)
  // =========================================================================
  describe('4. Turn Regeneration Contract & PostgreSQL Attempt Progression', () => {
    it('rejects regeneration with 409 Conflict when the turn is still PENDING', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/ai/conversations')
        .set('Authorization', 'Bearer valid_token')
        .send({ clientTurnId: 'turn_regen_active_01', userPrompt: 'Initial active query' })
        .expect(201);

      const convId = createRes.body.conversationId;
      const turnId = createRes.body.turnId;

      // Turn is PENDING, so regeneration must be rejected with 409
      const res = await request(app.getHttpServer())
        .post(`/api/v1/ai/conversations/${convId}/turns/${turnId}/regenerate`)
        .set('Authorization', 'Bearer valid_token')
        .send({ clientTurnId: 'turn_client_regen_active_01' })
        .expect(409);

      expect(res.body.code).toBe('AI_TURN_ALREADY_IN_PROGRESS');
    });

    it('regenerates turn when completed, increments attempt to 2, and retains attempt 1 as non-canonical', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/ai/conversations')
        .set('Authorization', 'Bearer valid_token')
        .send({ clientTurnId: 'turn_regen_succ_01', userPrompt: 'Protocol query for regeneration' })
        .expect(201);

      const convId = createRes.body.conversationId;
      const turnId = createRes.body.turnId;

      // Mark Turn 1 completed
      await prisma.aiConversationTurn.update({
        where: { id: turnId },
        data: { status: 'COMPLETED' },
      });
      await prisma.aiConversationMessage.updateMany({
        where: { turnId, role: 'ASSISTANT' },
        data: { status: 'SUCCESS', isCanonical: true, content: 'First attempt draft.' },
      });

      // Trigger regeneration (returns 200 OK)
      const regenRes = await request(app.getHttpServer())
        .post(`/api/v1/ai/conversations/${convId}/turns/${turnId}/regenerate`)
        .set('Authorization', 'Bearer valid_token')
        .send({ clientTurnId: 'turn_client_regen_succ_01' })
        .expect(200);

      expect(regenRes.body.conversationId).toBe(convId);
      expect(regenRes.body.turnId).toBe(turnId);
      expect(regenRes.body.attemptNumber).toBe(2);
      expect(regenRes.body.status).toBe('PENDING');

      // Verify in PostgreSQL:
      // Turn activeAttemptNumber is now 2 and status is PENDING
      const dbTurn = await prisma.aiConversationTurn.findUnique({
        where: { id: turnId },
      });
      expect(dbTurn?.activeAttemptNumber).toBe(2);
      expect(dbTurn?.status).toBe('PENDING');

      // Verify Attempt 1 message is preserved intact
      const att1Msg = await prisma.aiConversationMessage.findFirst({
        where: { turnId, role: 'ASSISTANT', attemptNumber: 1 },
      });
      expect(att1Msg).not.toBeNull();
      expect(att1Msg?.content).toBe('First attempt draft.');

      // New attempt 2 assistant message created with attemptNumber: 2 and status: PENDING
      const att2Msg = await prisma.aiConversationMessage.findFirst({
        where: { turnId, role: 'ASSISTANT', attemptNumber: 2 },
      });
      expect(att2Msg).not.toBeNull();
      expect(att2Msg?.attemptNumber).toBe(2);
      expect(att2Msg?.status).toBe('PENDING');
      expect(att2Msg?.isCanonical).toBe(false);
    });
  });

  // =========================================================================
  // 5. Citation Retrieval and Cryptographic Preview Stream (Task 4)
  // =========================================================================
  describe('5. Citation Retrieval and Cryptographic Preview Stream', () => {
    it('retrieves message citations and streams document preview with secure headers', async () => {
      // 1. Seed conversation & completed assistant message
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/ai/conversations')
        .set('Authorization', 'Bearer valid_token')
        .send({ clientTurnId: 'turn_cit_01', userPrompt: 'Citation test query' })
        .expect(201);

      const convId = createRes.body.conversationId;
      const turnId = createRes.body.turnId;
      const asstMsg = await prisma.aiConversationMessage.findFirst({
        where: { conversationId: convId, role: 'ASSISTANT' },
      });
      const msgId = asstMsg!.id;

      // 2. Seed document, version, and chunk in PostgreSQL
      const docId = 'doc_acl_guide_01';
      const verId = 'ver_acl_v1';
      const chunkId = 'chk_acl_01';

      await prisma.knowledgeDocument.create({
        data: {
          id: docId,
          tenantId: TENANT_ALPHA,
          title: 'Guía Clínica de LCA 2026',
          uploadedBy: USER_ALPHA_DOC,
          visibilityScope: VisibilityScope.ALL_STAFF,
        },
      });

      await prisma.documentVersion.create({
        data: {
          id: verId,
          documentId: docId,
          versionNumber: 1,
          originalFileName: 'guia-lca.pdf',
          mimeType: 'application/pdf',
          fileSize: 4096,
          checksum: 'a'.repeat(64),
          storageKey: `docs/${verId}`,
          uploadedBy: USER_ALPHA_DOC,
        },
      });

      await prisma.knowledgeChunk.create({
        data: {
          id: chunkId,
          tenantId: TENANT_ALPHA,
          documentId: docId,
          documentVersionId: verId,
          sequence: 1,
          content: 'El injerto HTH presenta mayor rigidez inicial que el semitendinoso.',
          tokenCount: 45,
          provenance: {},
          checksum: 'a'.repeat(64),
        },
      });

      // 3. Seed verified citation in PostgreSQL
      const citationId = 'cit_it07_test_01';
      await prisma.aiConversationCitation.create({
        data: {
          id: citationId,
          tenantId: TENANT_ALPHA,
          conversationId: convId,
          messageId: msgId,
          turnId,
          documentId: docId,
          documentVersionId: verId,
          chunkId,
          documentTitleSnapshot: 'Guía Clínica de LCA 2026',
          citationPosition: 1,
          excerpt: 'El injerto HTH presenta mayor rigidez inicial que el semitendinoso.',
          relevanceScore: 0.94,
        },
      });

      // 4. GET /:id/messages/:messageId/citations
      const listCitRes = await request(app.getHttpServer())
        .get(`/api/v1/ai/conversations/${convId}/messages/${msgId}/citations`)
        .set('Authorization', 'Bearer valid_token')
        .expect(200);

      expect(listCitRes.body.citations).toHaveLength(1);
      expect(listCitRes.body.citations[0].citationPosition).toBe(1);
      expect(listCitRes.body.citations[0].documentTitle).toBe('Guía Clínica de LCA 2026');

      // 5. GET /:id/messages/:messageId/citations/:citationId
      const detailCitRes = await request(app.getHttpServer())
        .get(`/api/v1/ai/conversations/${convId}/messages/${msgId}/citations/${citationId}`)
        .set('Authorization', 'Bearer valid_token')
        .expect(200);

      expect(detailCitRes.body.documentTitle).toBe('Guía Clínica de LCA 2026');
      expect(detailCitRes.body.excerpt).toContain('injerto HTH');

      // 6. GET /:id/messages/:messageId/citations/:citationId/preview
      const previewRes = await request(app.getHttpServer())
        .get(`/api/v1/ai/conversations/${convId}/messages/${msgId}/citations/${citationId}/preview`)
        .set('Authorization', 'Bearer valid_token')
        .expect(200);

      expect(previewRes.body.previewStatus).toBe('DOCUMENT_AVAILABLE');
      expect(previewRes.body.previewToken).toBeDefined();

      // 7. Cryptographic stream validation: GET .../citations/:citationId/content?token=...
      const streamRes = await request(app.getHttpServer())
        .get(
          `/api/v1/ai/conversations/${convId}/messages/${msgId}/citations/${citationId}/content?token=${previewRes.body.previewToken}`,
        )
        .expect(200);

      // Verify strict security headers
      expect(streamRes.headers['x-content-type-options']).toBe('nosniff');
      expect(streamRes.headers['content-disposition']).toContain('inline');
    });
  });

  // =========================================================================
  // 6. Concurrency, Idempotency, and Multi-Tenant IDOR Defense (Tasks 2, 7)
  // =========================================================================
  describe('6. Concurrency, Idempotency, and Multi-Tenant IDOR Defense', () => {
    it('handles idempotent replay without creating duplicate turns or messages in PostgreSQL', async () => {
      const clientTurnId = `ct_idem_${Date.now()}`;
      const payload = {
        clientTurnId,
        userPrompt: 'Idempotency query test',
        title: 'Idempotent Session',
      };

      // 1. Initial creation
      const firstRes = await request(app.getHttpServer())
        .post('/api/v1/ai/conversations')
        .set('Authorization', 'Bearer valid_token')
        .send(payload)
        .expect(201);

      expect(firstRes.body.isIdempotentReplay).toBe(false);
      expect(firstRes.body.idempotencyOutcome).toBe('CREATED');

      // 2. Immediate duplicate submission with identical payload
      const secondRes = await request(app.getHttpServer())
        .post('/api/v1/ai/conversations')
        .set('Authorization', 'Bearer valid_token')
        .send(payload)
        .expect(201);

      expect(secondRes.body.isIdempotentReplay).toBe(true);
      expect(secondRes.body.idempotencyOutcome).toBe('EXISTING_RECOVERED');
      expect(secondRes.body.conversationId).toBe(firstRes.body.conversationId);
      expect(secondRes.body.turnId).toBe(firstRes.body.turnId);

      // 3. PostgreSQL database verifies exactly 1 conversation and 1 turn
      const convCount = await prisma.aiConversation.count({
        where: { tenantId: TENANT_ALPHA },
      });
      expect(convCount).toBe(1);

      const turnCount = await prisma.aiConversationTurn.count({
        where: { conversationId: firstRes.body.conversationId },
      });
      expect(turnCount).toBe(1);
    });

    it('rejects concurrent turn reservation while an active turn is still PENDING with 409 Conflict', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/ai/conversations')
        .set('Authorization', 'Bearer valid_token')
        .send({ clientTurnId: 'turn_conc_t1', userPrompt: 'Turn 1 active' })
        .expect(201);

      const convId = createRes.body.conversationId;

      // Turn 1 is PENDING. Reserving Turn 2 must fail with 409
      const res = await request(app.getHttpServer())
        .post(`/api/v1/ai/conversations/${convId}/turns`)
        .set('Authorization', 'Bearer valid_token')
        .send({ clientTurnId: 'turn_conc_t2', userPrompt: 'Turn 2 while Turn 1 active' })
        .expect(409);

      expect(res.body.code).toBe('AI_TURN_ALREADY_IN_PROGRESS');
      expect(res.body.statusCode).toBe(409);
    });

    it('enforces multi-tenant IDOR protection: Tenant Beta cannot retrieve or mutate Tenant Alpha records', async () => {
      // 1. Create conversation in Tenant Alpha
      currentTestUser = doctorAlpha;
      const createRes = await request(app.getHttpServer())
        .post('/api/v1/ai/conversations')
        .set('Authorization', 'Bearer valid_token')
        .send({ clientTurnId: 'turn_idor_01', userPrompt: 'Tenant Alpha private medical data' })
        .expect(201);

      const convId = createRes.body.conversationId;

      // 2. Switch actor to Tenant Beta
      currentTestUser = doctorBeta;

      // Attempt GET conversation
      await request(app.getHttpServer())
        .get(`/api/v1/ai/conversations/${convId}`)
        .set('Authorization', 'Bearer valid_token')
        .expect(404);

      // Attempt POST reserve turn
      await request(app.getHttpServer())
        .post(`/api/v1/ai/conversations/${convId}/turns`)
        .set('Authorization', 'Bearer valid_token')
        .send({ clientTurnId: 'turn_idor_beta_t2', userPrompt: 'Intrusion turn' })
        .expect(404);

      // Attempt GET message history
      await request(app.getHttpServer())
        .get(`/api/v1/ai/conversations/${convId}/messages`)
        .set('Authorization', 'Bearer valid_token')
        .expect(404);

      // Attempt PATCH title
      await request(app.getHttpServer())
        .patch(`/api/v1/ai/conversations/${convId}/title`)
        .set('Authorization', 'Bearer valid_token')
        .send({ title: 'Tampered Title' })
        .expect(404);

      // Attempt DELETE archive
      await request(app.getHttpServer())
        .delete(`/api/v1/ai/conversations/${convId}`)
        .set('Authorization', 'Bearer valid_token')
        .expect(404);
    });
  });

  // =========================================================================
  // 7. Error Contracts, Correlation Tracking & Security (Task 8)
  // =========================================================================
  describe('7. Error Contracts, Correlation Tracking & Security', () => {
    it('returns standardized machine-readable error contracts with correlation headers', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ai/conversations/non_existent_conversation_id')
        .set('Authorization', 'Bearer valid_token')
        .set('x-correlation-id', 'corr_client_test_999')
        .expect(404);

      expect(res.body).toMatchObject({
        statusCode: 404,
        code: expect.any(String),
        message: expect.any(String),
        timestamp: expect.any(String),
        correlationId: 'corr_client_test_999',
      });

      // Header propagation
      expect(res.headers['x-correlation-id']).toBe('corr_client_test_999');
      expect(res.headers['x-request-id']).toBe('corr_client_test_999');
    });

    it('redacts raw stack traces, SQL syntax, and internal infrastructure details from error responses', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ai/conversations/non_existent_id')
        .set('Authorization', 'Bearer valid_token')
        .expect(404);

      const responseString = JSON.stringify(res.body);

      // Security assertions: no leakage of internal technology details
      expect(responseString).not.toMatch(/node_modules/i);
      expect(responseString).not.toMatch(/prisma/i);
      expect(responseString).not.toMatch(/SELECT .* FROM/i);
      expect(responseString).not.toMatch(/at Object\.<anonymous>/i);
      expect(responseString).not.toMatch(/password/i);
      expect(responseString).not.toMatch(/DATABASE_URL/i);
    });
  });
});
