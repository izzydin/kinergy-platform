import type { ChatMessage, Conversation, ConversationSummary } from '../types/assistant.types';

/** Maximum messages stored per thread before sliding window trims older messages */
export const MAX_MESSAGES_PER_CONVERSATION = 60;

/** Key prefix for browser localStorage */
export const STORAGE_KEY_PREFIX = 'kinergy_conv';

/**
 * Generates the tenant-and-user-partitioned storage key.
 */
export function getConversationStorageKey(tenantId: string, userId: string): string {
  const safeTenant = (tenantId || 'global').trim();
  const safeUser = (userId || 'anonymous').trim();
  return `${STORAGE_KEY_PREFIX}_${safeTenant}_${safeUser}`;
}

/**
 * In-memory fallback map when localStorage is unavailable (e.g. server-side rendering or quota exceeded).
 */
const inMemoryStore = new Map<string, string>();

function getStorageItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch {
    // LocalStorage blocked or unavailable
  }
  return inMemoryStore.get(key) ?? null;
}

function setStorageItem(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
      return;
    }
  } catch {
    // LocalStorage blocked or full
  }
  inMemoryStore.set(key, value);
}

function removeStorageItem(key: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
      return;
    }
  } catch {
    // LocalStorage blocked
  }
  inMemoryStore.delete(key);
}

/**
 * Client-Side Conversation Persistence Service (ADR-AI-09-01)
 *
 * Implements strict tenant- and user-partitioned local storage for conversations,
 * managing session lists, message sliding windows, and atomic message updates.
 */
export class AssistantStorageService {
  /**
   * Retrieves all conversations for the specified tenant and user.
   */
  getConversations(tenantId: string, userId: string): Conversation[] {
    const key = getConversationStorageKey(tenantId, userId);
    const serialized = getStorageItem(key);
    if (!serialized) return [];

    try {
      const parsed = JSON.parse(serialized);
      if (Array.isArray(parsed)) {
        return parsed as Conversation[];
      }
      return [];
    } catch {
      return [];
    }
  }

  /**
   * Retrieves lightweight conversation summaries sorted by most recently updated.
   */
  listSummaries(tenantId: string, userId: string): ConversationSummary[] {
    const conversations = this.getConversations(tenantId, userId);
    return conversations
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map((conv) => {
        const lastMessage = conv.messages[conv.messages.length - 1];
        return {
          id: conv.id,
          title: conv.title,
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          messageCount: conv.messages.length,
          lastMessagePreview: lastMessage?.content
            ? lastMessage.content.slice(0, 100) + (lastMessage.content.length > 100 ? '…' : '')
            : undefined,
        };
      });
  }

  /**
   * Retrieves a single conversation by ID.
   */
  getConversation(tenantId: string, userId: string, conversationId: string): Conversation | null {
    const conversations = this.getConversations(tenantId, userId);
    return conversations.find((c) => c.id === conversationId) ?? null;
  }

  /**
   * Creates a new conversation thread and prepends it to storage.
   */
  createConversation(
    tenantId: string,
    userId: string,
    title = 'Nueva Conversación',
    conversationId?: string,
  ): Conversation {
    const now = new Date().toISOString();
    const id =
      conversationId ||
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `conv_${Date.now()}`);

    const newConversation: Conversation = {
      id,
      title,
      createdAt: now,
      updatedAt: now,
      messages: [],
      tenantId,
      userId,
    };

    const conversations = this.getConversations(tenantId, userId);
    const updated = [newConversation, ...conversations.filter((c) => c.id !== id)];
    this.saveConversations(tenantId, userId, updated);

    return newConversation;
  }

  /**
   * Appends a message to a conversation, trimming via sliding window if necessary.
   */
  appendMessage(
    tenantId: string,
    userId: string,
    conversationId: string,
    message: ChatMessage,
  ): Conversation {
    const conversations = this.getConversations(tenantId, userId);
    let target = conversations.find((c) => c.id === conversationId);

    if (!target) {
      // Auto-create thread if not found
      target = {
        id: conversationId,
        title: message.content.slice(0, 40) || 'Nueva Conversación',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messages: [],
        tenantId,
        userId,
      };
      conversations.unshift(target);
    }

    const updatedMessages = [...target.messages, message];

    // Enforce sliding window
    const boundedMessages =
      updatedMessages.length > MAX_MESSAGES_PER_CONVERSATION
        ? updatedMessages.slice(updatedMessages.length - MAX_MESSAGES_PER_CONVERSATION)
        : updatedMessages;

    // Auto-update title from first user message if default
    let title = target.title;
    if (
      (title === 'Nueva Conversación' || !title) &&
      message.role === 'user' &&
      message.content.trim()
    ) {
      title = message.content.trim().slice(0, 45) + (message.content.trim().length > 45 ? '…' : '');
    }

    const updatedConversation: Conversation = {
      ...target,
      title,
      updatedAt: new Date().toISOString(),
      messages: boundedMessages,
    };

    const finalConversations = conversations.map((c) =>
      c.id === conversationId ? updatedConversation : c,
    );
    this.saveConversations(tenantId, userId, finalConversations);

    return updatedConversation;
  }

  /**
   * Updates an existing message in a conversation in-place (e.g. transitioning from pending to success/error).
   */
  updateMessage(
    tenantId: string,
    userId: string,
    conversationId: string,
    messageId: string,
    updates: Partial<ChatMessage>,
  ): Conversation | null {
    const conversations = this.getConversations(tenantId, userId);
    const target = conversations.find((c) => c.id === conversationId);
    if (!target) return null;

    const messageIndex = target.messages.findIndex((m) => m.id === messageId);
    if (messageIndex === -1) return null;

    const existingMessage = target.messages[messageIndex]!;
    const updatedMessage: ChatMessage = {
      ...existingMessage,
      ...updates,
      id: existingMessage.id, // Preserve ID
      role: existingMessage.role, // Preserve role
    };

    const updatedMessages = [...target.messages];
    updatedMessages[messageIndex] = updatedMessage;

    const updatedConversation: Conversation = {
      ...target,
      updatedAt: new Date().toISOString(),
      messages: updatedMessages,
    };

    const finalConversations = conversations.map((c) =>
      c.id === conversationId ? updatedConversation : c,
    );
    this.saveConversations(tenantId, userId, finalConversations);

    return updatedConversation;
  }

  /**
   * Updates the title of an existing conversation.
   */
  updateConversationTitle(
    tenantId: string,
    userId: string,
    conversationId: string,
    newTitle: string,
  ): Conversation | null {
    const conversations = this.getConversations(tenantId, userId);
    const target = conversations.find((c) => c.id === conversationId);
    if (!target) return null;

    const updatedConversation: Conversation = {
      ...target,
      title: newTitle.trim(),
      updatedAt: new Date().toISOString(),
    };

    const finalConversations = conversations.map((c) =>
      c.id === conversationId ? updatedConversation : c,
    );
    this.saveConversations(tenantId, userId, finalConversations);

    return updatedConversation;
  }

  /**
   * Deletes a conversation by ID.
   */
  deleteConversation(tenantId: string, userId: string, conversationId: string): boolean {
    const conversations = this.getConversations(tenantId, userId);
    const filtered = conversations.filter((c) => c.id !== conversationId);
    if (filtered.length === conversations.length) return false;

    this.saveConversations(tenantId, userId, filtered);
    return true;
  }

  /**
   * Clears all conversations for the given tenant and user.
   */
  clearConversations(tenantId: string, userId: string): void {
    const key = getConversationStorageKey(tenantId, userId);
    removeStorageItem(key);
  }

  private saveConversations(tenantId: string, userId: string, conversations: Conversation[]): void {
    const key = getConversationStorageKey(tenantId, userId);
    setStorageItem(key, JSON.stringify(conversations));
  }
}

export const assistantStorageService = new AssistantStorageService();
