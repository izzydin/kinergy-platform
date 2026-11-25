import {
  AiMessageFeedback,
  FeedbackRating,
  ConversationRole,
  SubmitMessageFeedbackUseCase,
  GetMessageFeedbackUseCase,
  RevokeMessageFeedbackUseCase,
  ConversationNotFoundError,
  TenantOwnershipViolationError,
  MessageNotFoundError,
  MessageNotBelongingToConversationError,
  FeedbackTargetNotAssistantMessageError,
  IAiConversationRepositoryPort,
  IAiConversationMessageRepositoryPort,
  IAiMessageFeedbackRepositoryPort,
  AiConversation,
  AiConversationMessage,
} from '../../../index';

describe('AI Message Feedback Domain & Use Cases (AI-09.5 - FB.02)', () => {
  const TENANT_ID = 'tenant_fb_test';
  const USER_ID = 'user_fb_physio';
  const OTHER_USER_ID = 'user_fb_intruder';
  const CONV_ID = 'conv_fb_001';
  const MSG_ASST_ID = 'msg_asst_001';
  const MSG_USER_ID = 'msg_user_001';

  let mockConvRepo: jest.Mocked<IAiConversationRepositoryPort>;
  let mockMsgRepo: jest.Mocked<IAiConversationMessageRepositoryPort>;
  let mockFeedbackRepo: jest.Mocked<IAiMessageFeedbackRepositoryPort>;

  let submitUseCase: SubmitMessageFeedbackUseCase;
  let getUseCase: GetMessageFeedbackUseCase;
  let revokeUseCase: RevokeMessageFeedbackUseCase;

  beforeEach(() => {
    mockConvRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      findByUserAndIdempotency: jest.fn(),
      listByUser: jest.fn(),
      listAllTenant: jest.fn(),
      delete: jest.fn(),
      archive: jest.fn(),
      updateTitle: jest.fn(),
    } as unknown as jest.Mocked<IAiConversationRepositoryPort>;

    mockMsgRepo = {
      save: jest.fn(),
      findById: jest.fn(),
      listByTurn: jest.fn(),
      listCanonicalHistory: jest.fn(),
      findCanonicalAssistantMessage: jest.fn(),
      updateStatus: jest.fn(),
      updateContent: jest.fn(),
      deleteByTurn: jest.fn(),
      deleteByConversation: jest.fn(),
    } as unknown as jest.Mocked<IAiConversationMessageRepositoryPort>;

    mockFeedbackRepo = {
      save: jest.fn(),
      findByMessageAndUser: jest.fn(),
      findById: jest.fn(),
      deleteByMessageAndUser: jest.fn(),
      listByConversation: jest.fn(),
    } as unknown as jest.Mocked<IAiMessageFeedbackRepositoryPort>;

    submitUseCase = new SubmitMessageFeedbackUseCase(mockConvRepo, mockMsgRepo, mockFeedbackRepo);

    getUseCase = new GetMessageFeedbackUseCase(mockConvRepo, mockMsgRepo, mockFeedbackRepo);

    revokeUseCase = new RevokeMessageFeedbackUseCase(mockConvRepo, mockMsgRepo, mockFeedbackRepo);
  });

  describe('1. AiMessageFeedback Domain Entity Invariants', () => {
    it('creates a valid feedback entity with positive rating and optional explanation', () => {
      const feedback = AiMessageFeedback.create({
        tenantId: TENANT_ID,
        conversationId: CONV_ID,
        messageId: MSG_ASST_ID,
        userId: USER_ID,
        rating: FeedbackRating.POSITIVE,
        explanation: '  Respuesta clínica muy precisa y bien referenciada.  ',
        category: 'ACCURACY',
      });

      expect(feedback.id).toBeDefined();
      expect(feedback.rating).toBe(FeedbackRating.POSITIVE);
      expect(feedback.explanation).toBe('Respuesta clínica muy precisa y bien referenciada.');
      expect(feedback.category).toBe('ACCURACY');
      expect(feedback.createdAt).toBeInstanceOf(Date);
      expect(feedback.updatedAt).toBeInstanceOf(Date);
    });

    it('rejects invalid or unapproved feedback ratings', () => {
      expect(() =>
        AiMessageFeedback.create({
          tenantId: TENANT_ID,
          conversationId: CONV_ID,
          messageId: MSG_ASST_ID,
          userId: USER_ID,
          rating: 'NOT_A_RATING' as FeedbackRating,
        }),
      ).toThrow();
    });

    it('rejects explanation exceeding 1000 characters', () => {
      const longExplanation = 'x'.repeat(1001);
      expect(() =>
        AiMessageFeedback.create({
          tenantId: TENANT_ID,
          conversationId: CONV_ID,
          messageId: MSG_ASST_ID,
          userId: USER_ID,
          rating: FeedbackRating.NEGATIVE,
          explanation: longExplanation,
        }),
      ).toThrow(/cannot exceed 1000 characters/i);
    });

    it('updates rating, explanation, and updates the updatedAt timestamp', () => {
      const feedback = AiMessageFeedback.create({
        tenantId: TENANT_ID,
        conversationId: CONV_ID,
        messageId: MSG_ASST_ID,
        userId: USER_ID,
        rating: FeedbackRating.POSITIVE,
      });

      const initialUpdatedAt = feedback.updatedAt;

      feedback.update(
        FeedbackRating.NEGATIVE,
        'Encontré una contradicción con la guía.',
        'INACCURACY',
      );

      expect(feedback.rating).toBe(FeedbackRating.NEGATIVE);
      expect(feedback.explanation).toBe('Encontré una contradicción con la guía.');
      expect(feedback.category).toBe('INACCURACY');
      expect(feedback.updatedAt.getTime()).toBeGreaterThanOrEqual(initialUpdatedAt.getTime());
    });
  });

  describe('2. SubmitMessageFeedbackUseCase', () => {
    const mockConversation = AiConversation.create({
      id: CONV_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      title: 'Sesión de Rodilla',
    });

    const mockAsstMessage = AiConversationMessage.create({
      id: MSG_ASST_ID,
      conversationId: CONV_ID,
      turnId: 'turn_001',
      tenantId: TENANT_ID,
      role: ConversationRole.ASSISTANT,
      sequenceNumber: 2,
      content: 'El protocolo incluye crioterapia 15 min.',
    });

    const mockUserMessage = AiConversationMessage.create({
      id: MSG_USER_ID,
      conversationId: CONV_ID,
      turnId: 'turn_001',
      tenantId: TENANT_ID,
      role: ConversationRole.USER,
      sequenceNumber: 1,
      content: '¿Cuál es el protocolo?',
    });

    it('successfully submits positive feedback for an assistant response', async () => {
      mockConvRepo.findById.mockResolvedValue(mockConversation);
      mockMsgRepo.findById.mockResolvedValue(mockAsstMessage);
      mockFeedbackRepo.findByMessageAndUser.mockResolvedValue(null);
      mockFeedbackRepo.save.mockImplementation(async (f: AiMessageFeedback) => f);

      const result = await submitUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: CONV_ID,
        messageId: MSG_ASST_ID,
        rating: FeedbackRating.POSITIVE,
        explanation: 'Excelente fundamentación.',
      });

      expect(result.isUpdate).toBe(false);
      expect(result.feedback.rating).toBe(FeedbackRating.POSITIVE);
      expect(result.feedback.explanation).toBe('Excelente fundamentación.');
      expect(mockFeedbackRepo.save).toHaveBeenCalledTimes(1);
    });

    it('idempotently updates existing feedback if already submitted by the same user', async () => {
      const existing = AiMessageFeedback.create({
        tenantId: TENANT_ID,
        conversationId: CONV_ID,
        messageId: MSG_ASST_ID,
        userId: USER_ID,
        rating: FeedbackRating.POSITIVE,
      });

      mockConvRepo.findById.mockResolvedValue(mockConversation);
      mockMsgRepo.findById.mockResolvedValue(mockAsstMessage);
      mockFeedbackRepo.findByMessageAndUser.mockResolvedValue(existing);
      mockFeedbackRepo.save.mockImplementation(async (f: AiMessageFeedback) => f);

      const result = await submitUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: CONV_ID,
        messageId: MSG_ASST_ID,
        rating: FeedbackRating.NEGATIVE,
        explanation: 'Cambio de opinión tras revisar la guía.',
      });

      expect(result.isUpdate).toBe(true);
      expect(result.feedback.rating).toBe(FeedbackRating.NEGATIVE);
      expect(result.feedback.explanation).toBe('Cambio de opinión tras revisar la guía.');
    });

    it('rejects feedback on user messages (enforces assistant-only invariant)', async () => {
      mockConvRepo.findById.mockResolvedValue(mockConversation);
      mockMsgRepo.findById.mockResolvedValue(mockUserMessage);

      await expect(
        submitUseCase.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: CONV_ID,
          messageId: MSG_USER_ID,
          rating: FeedbackRating.POSITIVE,
        }),
      ).rejects.toThrow(FeedbackTargetNotAssistantMessageError);
    });

    it('rejects submission when conversation does not belong to authenticated user', async () => {
      mockConvRepo.findById.mockResolvedValue(mockConversation);

      await expect(
        submitUseCase.execute({
          tenantId: TENANT_ID,
          userId: OTHER_USER_ID, // Intruder
          conversationId: CONV_ID,
          messageId: MSG_ASST_ID,
          rating: FeedbackRating.POSITIVE,
        }),
      ).rejects.toThrow(TenantOwnershipViolationError);
    });

    it('rejects submission when message does not belong to specified conversation', async () => {
      const foreignMessage = AiConversationMessage.create({
        id: 'msg_other',
        conversationId: 'conv_other',
        turnId: 'turn_002',
        tenantId: TENANT_ID,
        role: ConversationRole.ASSISTANT,
        sequenceNumber: 2,
        content: 'Otro mensaje',
      });

      mockConvRepo.findById.mockResolvedValue(mockConversation);
      mockMsgRepo.findById.mockResolvedValue(foreignMessage);

      await expect(
        submitUseCase.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: CONV_ID,
          messageId: 'msg_other',
          rating: FeedbackRating.POSITIVE,
        }),
      ).rejects.toThrow(MessageNotBelongingToConversationError);
    });

    it('rejects submission when conversation is not found', async () => {
      mockConvRepo.findById.mockResolvedValue(null);

      await expect(
        submitUseCase.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: 'conv_nonexistent',
          messageId: MSG_ASST_ID,
          rating: FeedbackRating.POSITIVE,
        }),
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it('rejects submission when message is not found', async () => {
      mockConvRepo.findById.mockResolvedValue(mockConversation);
      mockMsgRepo.findById.mockResolvedValue(null);

      await expect(
        submitUseCase.execute({
          tenantId: TENANT_ID,
          userId: USER_ID,
          conversationId: CONV_ID,
          messageId: 'msg_nonexistent',
          rating: FeedbackRating.POSITIVE,
        }),
      ).rejects.toThrow(MessageNotFoundError);
    });
  });

  describe('3. GetMessageFeedbackUseCase & RevokeMessageFeedbackUseCase', () => {
    const mockConversation = AiConversation.create({
      id: CONV_ID,
      tenantId: TENANT_ID,
      userId: USER_ID,
      title: 'Sesión de Rodilla',
    });

    const mockAsstMessage = AiConversationMessage.create({
      id: MSG_ASST_ID,
      conversationId: CONV_ID,
      turnId: 'turn_001',
      tenantId: TENANT_ID,
      role: ConversationRole.ASSISTANT,
      sequenceNumber: 2,
      content: 'Respuesta del asistente',
    });

    it('retrieves existing feedback for message and user', async () => {
      const feedback = AiMessageFeedback.create({
        tenantId: TENANT_ID,
        conversationId: CONV_ID,
        messageId: MSG_ASST_ID,
        userId: USER_ID,
        rating: FeedbackRating.POSITIVE,
      });

      mockConvRepo.findById.mockResolvedValue(mockConversation);
      mockMsgRepo.findById.mockResolvedValue(mockAsstMessage);
      mockFeedbackRepo.findByMessageAndUser.mockResolvedValue(feedback);

      const result = await getUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: CONV_ID,
        messageId: MSG_ASST_ID,
      });

      expect(result.feedback).not.toBeNull();
      expect(result.feedback?.rating).toBe(FeedbackRating.POSITIVE);
    });

    it('successfully revokes existing feedback', async () => {
      mockConvRepo.findById.mockResolvedValue(mockConversation);
      mockMsgRepo.findById.mockResolvedValue(mockAsstMessage);
      mockFeedbackRepo.deleteByMessageAndUser.mockResolvedValue(true);

      const result = await revokeUseCase.execute({
        tenantId: TENANT_ID,
        userId: USER_ID,
        conversationId: CONV_ID,
        messageId: MSG_ASST_ID,
      });

      expect(result.revoked).toBe(true);
      expect(mockFeedbackRepo.deleteByMessageAndUser).toHaveBeenCalledWith(
        TENANT_ID,
        CONV_ID,
        MSG_ASST_ID,
        USER_ID,
      );
    });
  });
});
