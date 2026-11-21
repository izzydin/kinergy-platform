import { InMemoryConversationRepositoryAdapter } from '../in-memory-conversation-repository.adapter';
import { ConversationSession } from '@kinergy-platform/core';

describe('InMemoryConversationRepositoryAdapter Unit Tests', () => {
  let adapter: InMemoryConversationRepositoryAdapter;

  beforeEach(() => {
    adapter = new InMemoryConversationRepositoryAdapter(24); // 24 hours TTL
  });

  it('should save and find session within the correct tenant', async () => {
    const session = ConversationSession.create({
      id: 'sess-100',
      tenantId: 'tenant-clinica',
      userId: 'user-1',
    });

    await adapter.save(session);
    const found = await adapter.findById('sess-100', 'tenant-clinica');

    expect(found).not.toBeNull();
    expect(found?.id).toBe('sess-100');
    expect(found?.tenantId).toBe('tenant-clinica');
  });

  it('should enforce tenant isolation by never returning session to another tenant', async () => {
    const session = ConversationSession.create({
      id: 'sess-100',
      tenantId: 'tenant-clinica-A',
      userId: 'user-1',
    });

    await adapter.save(session);

    const crossTenantLookup = await adapter.findById('sess-100', 'tenant-clinica-B');
    expect(crossTenantLookup).toBeNull();
  });

  it('should list sessions by user sorted by most recent updatedAt', async () => {
    const session1 = ConversationSession.create({
      id: 'sess-1',
      tenantId: 'tenant-1',
      userId: 'user-alpha',
      updatedAt: new Date(Date.now() - 5000),
    });
    const session2 = ConversationSession.create({
      id: 'sess-2',
      tenantId: 'tenant-1',
      userId: 'user-alpha',
      updatedAt: new Date(Date.now()),
    });
    const sessionOtherUser = ConversationSession.create({
      id: 'sess-3',
      tenantId: 'tenant-1',
      userId: 'user-beta',
    });

    await adapter.save(session1);
    await adapter.save(session2);
    await adapter.save(sessionOtherUser);

    const userList = await adapter.listByUser('tenant-1', 'user-alpha');
    expect(userList).toHaveLength(2);
    expect(userList[0]?.id).toBe('sess-2');
    expect(userList[1]?.id).toBe('sess-1');
  });

  it('should delete session from tenant partition', async () => {
    const session = ConversationSession.create({
      id: 'sess-del',
      tenantId: 'tenant-1',
      userId: 'user-1',
    });

    await adapter.save(session);
    expect(await adapter.findById('sess-del', 'tenant-1')).not.toBeNull();

    await adapter.delete('sess-del', 'tenant-1');
    expect(await adapter.findById('sess-del', 'tenant-1')).toBeNull();
  });

  it('should prune expired sessions according to configured TTL', async () => {
    const shortTtlAdapter = new InMemoryConversationRepositoryAdapter(0.0001); // ~360ms TTL

    const expiredSession = ConversationSession.create({
      id: 'sess-exp',
      tenantId: 'tenant-1',
      userId: 'user-1',
      updatedAt: new Date(Date.now() - 2000), // 2 seconds old
    });

    await shortTtlAdapter.save(expiredSession);

    // When queried directly, expired session is deleted and returns null
    const found = await shortTtlAdapter.findById('sess-exp', 'tenant-1');
    expect(found).toBeNull();
  });
});
