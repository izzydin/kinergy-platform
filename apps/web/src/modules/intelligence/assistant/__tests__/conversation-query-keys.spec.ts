import {
  conversationQueryKeys,
  conversationKeys,
  sanitizeConversationQueryParams,
} from '../api/conversation-query-keys';

describe('conversationQueryKeys', () => {
  it('should expose stable root and aliased factory', () => {
    expect(conversationQueryKeys.all).toEqual(['ai-conversations']);
    expect(conversationKeys).toBe(conversationQueryKeys);
  });

  describe('userScope partitioning (Cache Isolation)', () => {
    it('should partition keys by tenantId and userId when scope is provided', () => {
      const scope1 = { tenantId: 'tenant-alpha', userId: 'user-001' };
      const scope2 = { tenantId: 'tenant-beta', userId: 'user-002' };

      const key1 = conversationQueryKeys.userScope(scope1);
      const key2 = conversationQueryKeys.userScope(scope2);

      expect(key1).toEqual(['ai-conversations', 'tenant-alpha', 'user-001']);
      expect(key2).toEqual(['ai-conversations', 'tenant-beta', 'user-002']);
      expect(key1).not.toEqual(key2);
    });

    it('should use safe default values when scope is omitted', () => {
      const defaultKey = conversationQueryKeys.userScope();
      expect(defaultKey).toEqual(['ai-conversations', 'default_tenant', 'anonymous']);
    });
  });

  describe('lists and list keys', () => {
    const scope = { tenantId: 'tenant-test', userId: 'user-test' };

    it('should generate collection list root key', () => {
      expect(conversationQueryKeys.lists(scope)).toEqual([
        'ai-conversations',
        'tenant-test',
        'user-test',
        'list',
      ]);
    });

    it('should include sanitized query parameters in list key', () => {
      const params = { limit: 25, cursor: 'cursor_123', includeArchived: true };
      const key = conversationQueryKeys.list(params, scope);

      expect(key).toEqual([
        'ai-conversations',
        'tenant-test',
        'user-test',
        'list',
        { cursor: 'cursor_123', includeArchived: true, limit: 25 },
      ]);
    });

    it('should normalize empty / undefined values so keys match deterministically', () => {
      const keyA = conversationQueryKeys.list(
        { limit: 20, cursor: undefined, includeArchived: undefined },
        scope,
      );
      const keyB = conversationQueryKeys.list({ limit: 20 }, scope);

      expect(keyA).toEqual(keyB);
    });
  });

  describe('details and detail keys', () => {
    const scope = { tenantId: 'tenant-test', userId: 'user-test' };

    it('should generate details root key', () => {
      expect(conversationQueryKeys.details(scope)).toEqual([
        'ai-conversations',
        'tenant-test',
        'user-test',
        'detail',
      ]);
    });

    it('should generate specific conversation detail key', () => {
      expect(conversationQueryKeys.detail('conv-123', scope)).toEqual([
        'ai-conversations',
        'tenant-test',
        'user-test',
        'detail',
        'conv-123',
      ]);
    });
  });

  describe('messages and paginatedMessages keys', () => {
    const scope = { tenantId: 'tenant-test', userId: 'user-test' };

    it('should generate messages root and conversation message keys', () => {
      expect(conversationQueryKeys.messagesRoot(scope)).toEqual([
        'ai-conversations',
        'tenant-test',
        'user-test',
        'messages',
      ]);

      expect(conversationQueryKeys.messages('conv-abc', scope)).toEqual([
        'ai-conversations',
        'tenant-test',
        'user-test',
        'messages',
        'conv-abc',
      ]);
    });

    it('should generate paginated message history key with sequence parameters', () => {
      const key = conversationQueryKeys.paginatedMessages(
        'conv-abc',
        { cursor: 'seq_50', limit: 20 },
        scope,
      );

      expect(key).toEqual([
        'ai-conversations',
        'tenant-test',
        'user-test',
        'messages',
        'conv-abc',
        { cursor: 'seq_50', limit: 20 },
      ]);
    });
  });

  describe('sanitizeConversationQueryParams', () => {
    it('should return empty object for undefined / null params', () => {
      expect(sanitizeConversationQueryParams(undefined)).toEqual({});
    });

    it('should sort keys deterministically regardless of input insertion order', () => {
      const obj1 = { z: '1', a: '2', m: '3' };
      const obj2 = { a: '2', m: '3', z: '1' };

      const sanitized1 = sanitizeConversationQueryParams(obj1);
      const sanitized2 = sanitizeConversationQueryParams(obj2);

      expect(JSON.stringify(sanitized1)).toEqual(JSON.stringify(sanitized2));
      expect(Object.keys(sanitized1)).toEqual(['a', 'm', 'z']);
    });

    it('should remove null, undefined, and empty string properties', () => {
      const sanitized = sanitizeConversationQueryParams({
        cursor: '',
        limit: 10,
        filter: undefined,
        empty: null,
      });

      expect(sanitized).toEqual({ limit: 10 });
    });
  });
});
