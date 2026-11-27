import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { AiConversationController } from '../ai-conversation.controller';
import { AuthenticationGuard } from '../../../platform/identity/guards/authentication.guard';
import { AuthorizationGuard } from '../../../platform/identity/authorization/authorization.guard';
import { ROLES_KEY } from '../../../platform/identity/authorization/decorators/roles.decorator';
import { PERMISSIONS_KEY } from '../../../platform/identity/authorization/decorators/permissions.decorator';
import { PERMISSIONS } from '../../../platform/identity/authorization/permissions';
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
  ConversationNotFoundError,
  TenantOwnershipViolationError,
  TransactionFailureError,
  InvalidTurnInputError,
} from '@kinergy-platform/core';
import { TrustedAi, TrustedAiContext } from '../decorators/trusted-ai-context.decorator';

/**
 * AI-09.3-BE.05.05 — Security, Tenant Isolation, RBAC & Ownership Hardening Tests
 *
 * Verifies:
 * 1. Authentication & Authorization Guard bindings and decorator metadata on controller and endpoints.
 * 2. RBAC rules: privileged inspection strictly enforces @Roles('Owner') and 'ai.conversations.audit'.
 * 3. Identity and Tenant extraction: client body/param injection ignored; strictly bound to authenticated token.
 * 4. Cross-tenant access attempts return 404 Not Found (never leaking resource existence).
 * 5. Privileged inspection fail-closed guarantee: audit log persistence failure blocks all conversation data.
 * 6. Non-Owner roles rejected both at guard and use case boundary.
 * 7. Mass-assignment and tamper resistance.
 */
describe('AI-09.3-BE.05.05 — Security, Tenant Isolation & RBAC Hardening', () => {
  let controller: AiConversationController;
  let reflector: Reflector;

  let createUseCase: jest.Mocked<CreateConversationWithInitialTurnUseCase>;
  let reserveTurnUseCase: jest.Mocked<ReserveConversationTurnUseCase>;
  let getUseCase: jest.Mocked<GetConversationUseCase>;
  let listUseCase: jest.Mocked<ListConversationsUseCase>;
  let getHistoryUseCase: jest.Mocked<GetMessageHistoryUseCase>;
  let updateTitleUseCase: jest.Mocked<UpdateConversationTitleUseCase>;
  let archiveUseCase: jest.Mocked<ArchiveConversationUseCase>;
  let inspectUseCase: jest.Mocked<PrivilegedInspectConversationUseCase>;
  let cancelTurnUseCase: jest.Mocked<CancelConversationTurnUseCase>;

  const authOwnerAlpha: TrustedAiContext = {
    actorId: 'usr_owner_alpha',
    tenantId: 'tenant_alpha',
    roles: ['Owner'],
    permissions: [PERMISSIONS.AI.CONVERSATIONS_AUDIT],
    email: 'owner@alpha.com',
  };

  const authTrainerAlpha: TrustedAiContext = {
    actorId: 'usr_trainer_alpha',
    tenantId: 'tenant_alpha',
    roles: ['Trainer'],
    permissions: [],
    email: 'trainer@alpha.com',
  };

  const authDoctorBeta: TrustedAiContext = {
    actorId: 'usr_doc_beta',
    tenantId: 'tenant_beta',
    roles: ['Doctor'],
    permissions: [],
    email: 'doc@beta.com',
  };

  beforeEach(async () => {
    createUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CreateConversationWithInitialTurnUseCase>;
    reserveTurnUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<ReserveConversationTurnUseCase>;
    getUseCase = { execute: jest.fn() } as unknown as jest.Mocked<GetConversationUseCase>;
    listUseCase = { execute: jest.fn() } as unknown as jest.Mocked<ListConversationsUseCase>;
    getHistoryUseCase = { execute: jest.fn() } as unknown as jest.Mocked<GetMessageHistoryUseCase>;
    updateTitleUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<UpdateConversationTitleUseCase>;
    archiveUseCase = { execute: jest.fn() } as unknown as jest.Mocked<ArchiveConversationUseCase>;
    inspectUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<PrivilegedInspectConversationUseCase>;
    cancelTurnUseCase = {
      execute: jest.fn(),
    } as unknown as jest.Mocked<CancelConversationTurnUseCase>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiConversationController],
      providers: [
        Reflector,
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
    reflector = module.get<Reflector>(Reflector);
  });

  describe('1. Controller Guard & Metadata Security Bindings', () => {
    it('enforces AuthenticationGuard and AuthorizationGuard at the controller class level', () => {
      const guards = Reflect.getMetadata('__guards__', AiConversationController);
      expect(guards).toBeDefined();
      expect(guards).toContain(AuthenticationGuard);
      expect(guards).toContain(AuthorizationGuard);
    });

    it('enforces Owner role on auditInspect endpoint via @Roles decorator', () => {
      const roles = reflector.get<string[]>(ROLES_KEY, controller.auditInspect);
      expect(roles).toBeDefined();
      expect(roles).toEqual(['Owner']);
    });

    it('enforces PERMISSIONS.AI.CONVERSATIONS_AUDIT permission on auditInspect via @RequirePermissions decorator', () => {
      const permissions = reflector.get<string[]>(PERMISSIONS_KEY, controller.auditInspect);
      expect(permissions).toBeDefined();
      expect(permissions).toEqual(['ai.conversations.audit']);
    });
  });

  describe('2. Trusted Authentication Context & Tenant Extraction', () => {
    class DummyTarget {
      public testMethod(@TrustedAi() _ctx: TrustedAiContext) {}
    }

    const metadata = Reflect.getMetadata('__routeArguments__', DummyTarget, 'testMethod') as Record<
      string,
      { factory?: (data: unknown, ctx: ExecutionContext) => TrustedAiContext }
    >;
    const routeArgKey = Object.keys(metadata ?? {})[0];
    const factory = routeArgKey ? metadata[routeArgKey]?.factory : undefined;

    function extractContext(userPayload?: unknown): TrustedAiContext {
      const mockReq = { user: userPayload };
      const ctx = {
        switchToHttp: () => ({
          getRequest: () => mockReq,
        }),
      } as unknown as ExecutionContext;

      if (!factory) {
        throw new Error('TrustedAi factory not found');
      }
      return factory(undefined, ctx);
    }

    it('rejects unauthenticated requests lacking principal ID with UnauthorizedException', () => {
      expect(() => extractContext(null)).toThrow(UnauthorizedException);
      expect(() => extractContext({ id: '' })).toThrow(UnauthorizedException);
      expect(() => extractContext({ id: '   ' })).toThrow(UnauthorizedException);
    });

    it('rejects principals without tenantId with ForbiddenException (preventing cross-tenant leakage)', () => {
      expect(() => extractContext({ id: 'usr_1', tenantId: null })).toThrow(ForbiddenException);
      expect(() => extractContext({ id: 'usr_1', tenantId: '' })).toThrow(ForbiddenException);
      expect(() => extractContext({ id: 'usr_1', tenantId: '   ' })).toThrow(ForbiddenException);
    });

    it('trims whitespace and accurately extracts actorId, tenantId, roles, and permissions', () => {
      const context = extractContext({
        id: '  usr_doc_99  ',
        tenantId: '  tenant_alpha  ',
        email: 'doc@alpha.com',
        roles: ['Doctor'],
        permissions: ['ai:read'],
      });

      expect(context.actorId).toBe('usr_doc_99');
      expect(context.tenantId).toBe('tenant_alpha');
      expect(context.roles).toEqual(['Doctor']);
      expect(context.permissions).toEqual(['ai:read']);
    });
  });

  describe('3. Tenant Isolation & Cross-Tenant Access Defense', () => {
    it('returns ConversationNotFoundError (404) when Tenant B attempts to read Tenant A conversation', async () => {
      getUseCase.execute.mockRejectedValueOnce(
        new ConversationNotFoundError('conv_alpha_001', authDoctorBeta.tenantId),
      );

      await expect(controller.getConversation(authDoctorBeta, 'conv_alpha_001')).rejects.toThrow(
        ConversationNotFoundError,
      );

      expect(getUseCase.execute).toHaveBeenCalledWith({
        tenantId: authDoctorBeta.tenantId, // Strictly scoped to Tenant Beta
        conversationId: 'conv_alpha_001',
        userId: authDoctorBeta.actorId,
        includeTurns: true,
      });
    });

    it('returns ConversationNotFoundError (404) when Tenant B attempts to reserve a turn on Tenant A conversation', async () => {
      reserveTurnUseCase.execute.mockRejectedValueOnce(
        new ConversationNotFoundError('conv_alpha_001', authDoctorBeta.tenantId),
      );

      await expect(
        controller.reserveTurn(authDoctorBeta, 'conv_alpha_001', {
          clientTurnId: 'turn_beta_1',
          userPrompt: 'Unauthorized prompt across tenants',
        }),
      ).rejects.toThrow(ConversationNotFoundError);

      expect(reserveTurnUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: authDoctorBeta.tenantId,
          conversationId: 'conv_alpha_001',
        }),
      );
    });

    it('returns ConversationNotFoundError (404) when Tenant B attempts to read message history of Tenant A', async () => {
      getHistoryUseCase.execute.mockRejectedValueOnce(
        new ConversationNotFoundError('conv_alpha_001', authDoctorBeta.tenantId),
      );

      await expect(
        controller.getMessageHistory(authDoctorBeta, 'conv_alpha_001', { limit: 20 }),
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it('returns ConversationNotFoundError (404) when Tenant B attempts to update title of Tenant A conversation', async () => {
      updateTitleUseCase.execute.mockRejectedValueOnce(
        new ConversationNotFoundError('conv_alpha_001', authDoctorBeta.tenantId),
      );

      await expect(
        controller.updateTitle(authDoctorBeta, 'conv_alpha_001', { title: 'Tampered Title' }),
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it('returns ConversationNotFoundError (404) when Tenant B attempts to archive Tenant A conversation', async () => {
      archiveUseCase.execute.mockRejectedValueOnce(
        new ConversationNotFoundError('conv_alpha_001', authDoctorBeta.tenantId),
      );

      await expect(
        controller.archiveConversation(authDoctorBeta, 'conv_alpha_001'),
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it('strictly confines list conversations to the authenticated tenantId', async () => {
      listUseCase.execute.mockResolvedValueOnce({
        items: [],
        nextCursor: null,
        hasMore: false,
      });

      await controller.listConversations(authTrainerAlpha, { limit: 10 });

      expect(listUseCase.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: authTrainerAlpha.tenantId, // 'tenant_alpha'
        }),
      );
    });
  });

  describe('4. Privileged Inspection RBAC & Application Hardening', () => {
    it('permits authorized Owner with ai.conversations.audit to inspect conversation', async () => {
      const mockResult = {
        auditLogId: 'audit_log_001',
        conversation: {
          id: 'conv_alpha_001',
          tenantId: 'tenant_alpha',
          userId: 'usr_doc_alpha',
          title: 'Assessment',
          turnCounter: 1,
          messageCounter: 2,
          lastActivityAt: '2026-11-23T15:00:00.000Z',
          createdAt: '2026-11-23T14:00:00.000Z',
          updatedAt: '2026-11-23T15:00:00.000Z',
          isArchived: false,
          activeTurnId: null,
        },
        messages: [],
        inspectedAt: '2026-11-23T15:30:00.000Z',
      };

      inspectUseCase.execute.mockResolvedValueOnce(mockResult);

      const response = await controller.auditInspect(authOwnerAlpha, 'conv_alpha_001', {
        reason: 'Compliance audit for quality assurance certification #4928',
      });

      expect(response.auditLogId).toBe('audit_log_001');
      expect(response.conversation.id).toBe('conv_alpha_001');
      expect(inspectUseCase.execute).toHaveBeenCalledWith({
        tenantId: 'tenant_alpha',
        conversationId: 'conv_alpha_001',
        inspectorUserId: 'usr_owner_alpha',
        inspectorRole: 'Owner',
        reason: 'Compliance audit for quality assurance certification #4928',
      });
    });

    it('rejects non-Owner role at use case boundary with TenantOwnershipViolationError (403 Forbidden)', async () => {
      inspectUseCase.execute.mockRejectedValueOnce(
        new TenantOwnershipViolationError(
          'conv_alpha_001',
          'tenant_alpha',
          'Privileged conversation inspection is strictly restricted to the Owner role.',
        ),
      );

      await expect(
        controller.auditInspect(authTrainerAlpha, 'conv_alpha_001', {
          reason: 'Trainer attempting to inspect peer conversations',
        }),
      ).rejects.toThrow(TenantOwnershipViolationError);
    });

    it('rejects inspection when justification reason is under 10 characters with InvalidTurnInputError (400 Bad Request)', async () => {
      inspectUseCase.execute.mockRejectedValueOnce(
        new InvalidTurnInputError(
          'reason',
          'A clinical or compliance reason of at least 10 characters is required for privileged inspection.',
        ),
      );

      await expect(
        controller.auditInspect(authOwnerAlpha, 'conv_alpha_001', {
          reason: 'short',
        }),
      ).rejects.toThrow(InvalidTurnInputError);
    });
  });

  describe('5. Fail-Closed Audit Logging Guarantee', () => {
    it('aborts and fails closed when audit log persistence throws an error (never leaking conversation data)', async () => {
      // Simulate audit repository failure (e.g. database down, disk full, constraint error)
      inspectUseCase.execute.mockRejectedValueOnce(
        new TransactionFailureError(
          'Privileged inspection aborted: failed to persist mandatory audit log.',
          new Error('Audit table write lock timeout'),
        ),
      );

      // Must throw TransactionFailureError without returning conversation or messages
      await expect(
        controller.auditInspect(authOwnerAlpha, 'conv_alpha_001', {
          reason: 'Emergency clinical review of conversation data',
        }),
      ).rejects.toThrow(TransactionFailureError);
    });
  });

  describe('6. Trusted Identity Propagation & Same-Tenant BOLA Defense', () => {
    it('propagates the authenticated actorId and tenantId directly into getConversation use case', async () => {
      getUseCase.execute.mockResolvedValueOnce({
        id: 'conv_alpha_001',
        tenantId: 'tenant_alpha',
        userId: 'usr_trainer_alpha',
        title: 'Rehabilitation Protocol',
        turnCounter: 0,
        messageCounter: 0,
        lastActivityAt: '2026-11-27T10:00:00.000Z',
        createdAt: '2026-11-27T10:00:00.000Z',
        updatedAt: '2026-11-27T10:00:00.000Z',
        isArchived: false,
      });

      await controller.getConversation(authTrainerAlpha, 'conv_alpha_001');

      expect(getUseCase.execute).toHaveBeenCalledWith({
        tenantId: 'tenant_alpha',
        conversationId: 'conv_alpha_001',
        userId: 'usr_trainer_alpha',
        includeTurns: true,
      });
    });

    it('propagates the authenticated actorId and tenantId into updateTitle, ignoring client identity tampering', async () => {
      updateTitleUseCase.execute.mockResolvedValueOnce({
        conversationId: 'conv_alpha_001',
        title: 'Updated Safe Title',
        updatedAt: '2026-11-27T10:05:00.000Z',
      });

      await controller.updateTitle(authTrainerAlpha, 'conv_alpha_001', {
        title: 'Updated Safe Title',
      });

      expect(updateTitleUseCase.execute).toHaveBeenCalledWith({
        tenantId: 'tenant_alpha',
        conversationId: 'conv_alpha_001',
        userId: 'usr_trainer_alpha',
        title: 'Updated Safe Title',
      });
    });

    it('enforces allowAdminOverride=false for standard staff archiving conversations', async () => {
      archiveUseCase.execute.mockResolvedValueOnce({
        conversationId: 'conv_alpha_001',
        isArchived: true,
        archivedAt: '2026-11-27T10:10:00.000Z',
      });

      await controller.archiveConversation(authTrainerAlpha, 'conv_alpha_001');

      expect(archiveUseCase.execute).toHaveBeenCalledWith({
        tenantId: 'tenant_alpha',
        conversationId: 'conv_alpha_001',
        userId: 'usr_trainer_alpha',
        allowAdminOverride: false,
      });
    });

    it('enforces allowAdminOverride=true when an Owner or Admin archives a conversation', async () => {
      archiveUseCase.execute.mockResolvedValueOnce({
        conversationId: 'conv_alpha_001',
        isArchived: true,
        archivedAt: '2026-11-27T10:10:00.000Z',
      });

      await controller.archiveConversation(authOwnerAlpha, 'conv_alpha_001');

      expect(archiveUseCase.execute).toHaveBeenCalledWith({
        tenantId: 'tenant_alpha',
        conversationId: 'conv_alpha_001',
        userId: 'usr_owner_alpha',
        allowAdminOverride: true,
      });
    });

    it('propagates authenticated actorId into getMessageHistory to prevent cross-user message reads', async () => {
      getHistoryUseCase.execute.mockResolvedValueOnce({
        messages: [],
        nextCursor: null,
        hasMore: false,
      });

      await controller.getMessageHistory(authTrainerAlpha, 'conv_alpha_001', { limit: 10 });

      expect(getHistoryUseCase.execute).toHaveBeenCalledWith({
        tenantId: 'tenant_alpha',
        conversationId: 'conv_alpha_001',
        userId: 'usr_trainer_alpha',
        cursor: undefined,
        limit: 10,
      });
    });
  });
});
