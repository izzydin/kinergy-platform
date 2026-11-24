import { CanonicalChatMessageMapper } from '../mappers/canonical-chat-message.mapper';
import { AiConversationMessage } from '../../domain/models/ai-conversation-message.entity';
import { ConversationRole } from '../../domain/enums/conversation-role.enum';
import { GenerationStatus } from '../../domain/enums/generation-status.enum';
import { ChatMessage } from '../../domain/value-objects/chat-message.vo';
import { InvalidMessageOperationError } from '../errors/ai-conversation-application.error';

describe('BE.06.02 — CanonicalChatMessageMapper Unit Tests', () => {
  const createMockMessage = (props: {
    role: ConversationRole;
    content: string;
    isCanonical?: boolean;
    status?: GenerationStatus;
    sequenceNumber?: number;
    sources?: Record<string, unknown>[];
  }): AiConversationMessage => {
    return AiConversationMessage.reconstitute({
      id: 'msg_test_1',
      turnId: 'turn_test_1',
      conversationId: 'conv_test_1',
      tenantId: 'tenant_test_1',
      role: props.role,
      sequenceNumber: props.sequenceNumber ?? 1,
      attemptNumber: 1,
      isCanonical: props.isCanonical ?? false,
      status: props.status ?? GenerationStatus.SUCCESS,
      content: props.content,
      sources: props.sources ?? null,
      metadata: null,
      errorCode: null,
      errorMessage: null,
      clientMessageId: null,
      leaseToken: null,
      leaseOwnerInstanceId: null,
      leaseExpiresAt: null,
      createdAt: new Date(),
      completedAt: new Date(),
      updatedAt: new Date(),
    });
  };

  describe('Role semantics preservation', () => {
    it('1. correctly maps USER role to user', () => {
      const msg = createMockMessage({
        role: ConversationRole.USER,
        content: '¿Cuáles son las pautas para tendinopatía rotuliana?',
      });

      const chatMsg = CanonicalChatMessageMapper.toChatMessage(msg);
      expect(chatMsg.role).toBe('user');
      expect(chatMsg.content).toBe('¿Cuáles son las pautas para tendinopatía rotuliana?');
    });

    it('2. correctly maps ASSISTANT role to assistant', () => {
      const msg = createMockMessage({
        role: ConversationRole.ASSISTANT,
        content: 'Se recomienda reposo activo y ejercicios isométricos.',
        isCanonical: true,
      });

      const chatMsg = CanonicalChatMessageMapper.toChatMessage(msg);
      expect(chatMsg.role).toBe('assistant');
      expect(chatMsg.content).toBe('Se recomienda reposo activo y ejercicios isométricos.');
    });

    it('3. correctly maps SYSTEM role to system', () => {
      const msg = createMockMessage({
        role: ConversationRole.SYSTEM,
        content: 'Instrucción de sistema contextual.',
      });

      const chatMsg = CanonicalChatMessageMapper.toChatMessage(msg);
      expect(chatMsg.role).toBe('system');
      expect(chatMsg.content).toBe('Instrucción de sistema contextual.');
    });
  });

  describe('Content preservation and defensive handling', () => {
    it('4. preserves message content trimming outer whitespace', () => {
      const msg = createMockMessage({
        role: ConversationRole.USER,
        content: '   Pregunta con espacios exteriores   \n',
      });

      const chatMsg = CanonicalChatMessageMapper.toChatMessage(msg);
      expect(chatMsg.content).toBe('Pregunta con espacios exteriores');
    });

    it('5. safely bounds oversized messages to MAX_MESSAGE_LENGTH without throwing', () => {
      const longContent = 'A'.repeat(5000);
      const msg = createMockMessage({
        role: ConversationRole.ASSISTANT,
        content: longContent,
        isCanonical: true,
      });

      const chatMsg = CanonicalChatMessageMapper.toChatMessage(msg);
      expect(chatMsg.content.length).toBe(ChatMessage.MAX_MESSAGE_LENGTH);
      expect(chatMsg.content).toBe('A'.repeat(ChatMessage.MAX_MESSAGE_LENGTH));
    });

    it('6. returns null via toChatMessageOrNull for empty or purely whitespace content', () => {
      const emptyMsg = createMockMessage({
        role: ConversationRole.USER,
        content: '    ',
      });

      const result = CanonicalChatMessageMapper.toChatMessageOrNull(emptyMsg);
      expect(result).toBeNull();
    });

    it('7. throws InvalidMessageOperationError via toChatMessage when message cannot be mapped', () => {
      const emptyMsg = createMockMessage({
        role: ConversationRole.USER,
        content: '   ',
      });

      expect(() => CanonicalChatMessageMapper.toChatMessage(emptyMsg)).toThrow(
        InvalidMessageOperationError,
      );
    });

    it('8. keeps source citations separate from message content', () => {
      const msg = createMockMessage({
        role: ConversationRole.ASSISTANT,
        content: 'Respuesta clínica fundamentada en evidencia.',
        isCanonical: true,
        sources: [
          {
            documentId: 'doc_1',
            documentTitle: 'Guía Clínica de Tendinopatías',
            relevanceScore: 0.95,
          },
        ],
      });

      const chatMsg = CanonicalChatMessageMapper.toChatMessage(msg);
      // Source citations must NOT be serialized or injected into the message content text
      expect(chatMsg.content).toBe('Respuesta clínica fundamentada en evidencia.');
      expect(chatMsg.content).not.toContain('Guía Clínica');
      expect(chatMsg.content).not.toContain('doc_1');
    });
  });
});
