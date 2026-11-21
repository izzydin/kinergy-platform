import { Injectable, Logger, Optional } from '@nestjs/common';
import { IConversationRepositoryPort, ConversationSession } from '@kinergy-platform/core';

/**
 * In-memory implementation of IConversationRepositoryPort.
 *
 * Provides tenant-isolated conversation session storage with automatic TTL expiration
 * and strict ownership boundaries.
 */
@Injectable()
export class InMemoryConversationRepositoryAdapter implements IConversationRepositoryPort {
  private readonly logger = new Logger(InMemoryConversationRepositoryAdapter.name);

  // Tenant-partitioned storage: Map<tenantId, Map<conversationId, ConversationSession>>
  private readonly tenantStorage = new Map<string, Map<string, ConversationSession>>();
  private readonly ttlMs: number;

  constructor(@Optional() ttlHours?: number) {
    this.ttlMs = (ttlHours ?? 24) * 60 * 60 * 1000;
  }

  public async findById(id: string, tenantId: string): Promise<ConversationSession | null> {
    if (!id || !tenantId) return null;

    const tenantMap = this.tenantStorage.get(tenantId);
    if (!tenantMap) return null;

    const session = tenantMap.get(id);
    if (!session) return null;

    // Data lifecycle TTL check
    if (this.isExpired(session)) {
      tenantMap.delete(id);
      return null;
    }

    return session;
  }

  public async save(session: ConversationSession): Promise<void> {
    if (!session || !session.tenantId || !session.id) {
      throw new Error('Cannot save invalid conversation session.');
    }

    let tenantMap = this.tenantStorage.get(session.tenantId);
    if (!tenantMap) {
      tenantMap = new Map<string, ConversationSession>();
      this.tenantStorage.set(session.tenantId, tenantMap);
    }

    tenantMap.set(session.id, session);
  }

  public async delete(id: string, tenantId: string): Promise<void> {
    if (!id || !tenantId) return;

    const tenantMap = this.tenantStorage.get(tenantId);
    if (tenantMap) {
      tenantMap.delete(id);
    }
  }

  public async listByUser(
    tenantId: string,
    userId: string,
    limit = 20,
  ): Promise<ConversationSession[]> {
    if (!tenantId || !userId) return [];

    const tenantMap = this.tenantStorage.get(tenantId);
    if (!tenantMap) return [];

    const result: ConversationSession[] = [];
    for (const session of tenantMap.values()) {
      if (session.userId === userId && !this.isExpired(session)) {
        result.push(session);
      }
    }

    // Sort by most recently updated
    result.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    return result.slice(0, limit);
  }

  /**
   * Cleans up expired sessions across all tenants.
   */
  public pruneExpiredSessions(): number {
    let prunedCount = 0;
    const now = Date.now();

    for (const [tenantId, tenantMap] of this.tenantStorage.entries()) {
      for (const [id, session] of tenantMap.entries()) {
        if (now - session.updatedAt.getTime() > this.ttlMs) {
          tenantMap.delete(id);
          prunedCount++;
        }
      }
      if (tenantMap.size === 0) {
        this.tenantStorage.delete(tenantId);
      }
    }

    if (prunedCount > 0) {
      this.logger.debug(`Pruned ${prunedCount} expired conversation sessions.`);
    }

    return prunedCount;
  }

  /**
   * Test helper to clear all in-memory data.
   */
  public clear(): void {
    this.tenantStorage.clear();
  }

  private isExpired(session: ConversationSession): boolean {
    return Date.now() - session.updatedAt.getTime() > this.ttlMs;
  }
}
