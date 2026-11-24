import {
  AssistantStorageService,
  getConversationStorageKey,
  MAX_MESSAGES_PER_CONVERSATION,
} from '../services/assistant-storage.service';
import type { ChatMessage } from '../types/assistant.types';

describe('AssistantStorageService (ADR-AI-09-01)', () => {
  let service: AssistantStorageService;
  const tenantId = 'tenant-corp-1';
  const userId = 'user-therapist-1';

  beforeEach(() => {
    service = new AssistantStorageService();
    service.clearConversations(tenantId, userId);
    service.clearConversations('other-tenant', 'other-user');
  });

  it('generates deterministic partitioned storage keys', () => {
    expect(getConversationStorageKey(tenantId, userId)).toBe(`kinergy_conv_${tenantId}_${userId}`);
  });

  it('creates and retrieves a new conversation thread', () => {
    const conv = service.createConversation(tenantId, userId, 'Sesión Cervical');

    expect(conv.id).toBeDefined();
    expect(conv.title).toBe('Sesión Cervical');
    expect(conv.tenantId).toBe(tenantId);
    expect(conv.userId).toBe(userId);
    expect(conv.messages).toEqual([]);

    const retrieved = service.getConversation(tenantId, userId, conv.id);
    expect(retrieved?.id).toBe(conv.id);
    expect(retrieved?.title).toBe('Sesión Cervical');
  });

  it('strictly isolates conversations between different tenants and users', () => {
    const conv1 = service.createConversation(tenantId, userId, 'Tenant 1 Conv');
    const conv2 = service.createConversation('other-tenant', 'other-user', 'Tenant 2 Conv');

    const list1 = service.getConversations(tenantId, userId);
    const list2 = service.getConversations('other-tenant', 'other-user');

    expect(list1.length).toBe(1);
    expect(list1[0]?.id).toBe(conv1.id);

    expect(list2.length).toBe(1);
    expect(list2[0]?.id).toBe(conv2.id);
  });

  it('appends messages and auto-titles from the first user prompt', () => {
    const conv = service.createConversation(tenantId, userId);
    expect(conv.title).toBe('Nueva Conversación');

    const userMsg: ChatMessage = {
      id: 'msg-1',
      role: 'user',
      content: '¿Cuáles son las contraindicaciones del vendaje neuromuscular?',
      createdAt: new Date().toISOString(),
      status: 'success',
    };

    const updated = service.appendMessage(tenantId, userId, conv.id, userMsg);
    expect(updated.messages.length).toBe(1);
    expect(updated.title).toContain('¿Cuáles son las contraindicaciones');
  });

  it('enforces sliding window capping messages at MAX_MESSAGES_PER_CONVERSATION', () => {
    const conv = service.createConversation(tenantId, userId);

    for (let i = 1; i <= MAX_MESSAGES_PER_CONVERSATION + 10; i++) {
      const msg: ChatMessage = {
        id: `msg-${i}`,
        role: i % 2 === 0 ? 'assistant' : 'user',
        content: `Message turn ${i}`,
        createdAt: new Date().toISOString(),
        status: 'success',
      };
      service.appendMessage(tenantId, userId, conv.id, msg);
    }

    const retrieved = service.getConversation(tenantId, userId, conv.id);
    expect(retrieved?.messages.length).toBe(MAX_MESSAGES_PER_CONVERSATION);
    // Oldest messages (1 through 10) trimmed
    expect(retrieved?.messages[0]?.id).toBe('msg-11');
    expect(retrieved?.messages[retrieved.messages.length - 1]?.id).toBe(
      `msg-${MAX_MESSAGES_PER_CONVERSATION + 10}`,
    );
  });

  it('updates messages in-place without altering other turns', () => {
    const conv = service.createConversation(tenantId, userId);
    const pendingMsg: ChatMessage = {
      id: 'msg-pending',
      role: 'assistant',
      content: '',
      createdAt: new Date().toISOString(),
      status: 'pending',
    };

    service.appendMessage(tenantId, userId, conv.id, pendingMsg);

    const updated = service.updateMessage(tenantId, userId, conv.id, 'msg-pending', {
      content: 'Final synthesized response',
      status: 'success',
      grounded: true,
    });

    expect(updated?.messages[0]?.status).toBe('success');
    expect(updated?.messages[0]?.content).toBe('Final synthesized response');
    expect(updated?.messages[0]?.grounded).toBe(true);
  });

  it('deletes conversations and clears user storage', () => {
    const conv = service.createConversation(tenantId, userId, 'To delete');
    expect(service.getConversations(tenantId, userId).length).toBe(1);

    const deleted = service.deleteConversation(tenantId, userId, conv.id);
    expect(deleted).toBe(true);
    expect(service.getConversations(tenantId, userId).length).toBe(0);

    service.createConversation(tenantId, userId, 'Another');
    service.clearConversations(tenantId, userId);
    expect(service.getConversations(tenantId, userId).length).toBe(0);
  });
});
