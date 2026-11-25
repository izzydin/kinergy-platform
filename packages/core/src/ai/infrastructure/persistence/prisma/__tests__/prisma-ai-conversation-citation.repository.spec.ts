import { PrismaClient } from '@prisma/client';
import { PrismaAiConversationCitationRepository } from '../repositories/prisma-ai-conversation-citation.repository';
import { PrismaAiConversationCitationMapper } from '../mappers/prisma-ai-conversation-citation.mapper';
import { AiConversationCitation } from '../../../../domain/models/ai-conversation-citation.entity';

describe('PrismaAiConversationCitationRepository & Mapper Tests', () => {
  const tenantId = 'tenant_test_123';
  const conversationId = 'conv_test_123';
  const turnId = 'turn_test_123';
  const messageId = 'msg_test_123';
  const citationId = 'cite_test_123';

  const mockDbCitation = {
    id: citationId,
    messageId,
    turnId,
    conversationId,
    tenantId,
    documentId: 'doc_123',
    documentVersionId: 'dver_123',
    chunkId: 'chunk_123',
    citationPosition: 1,
    documentTitleSnapshot: 'Kinesiology Manual',
    excerpt: 'Gentle spinal decompression is recommended for acute cervical disc herniation.',
    pageNumber: 42,
    headingPath: ['Chapter 4', 'Decompression Protocols'],
    retrievalRank: 1,
    relevanceScore: 0.95,
    sourceStrategy: 'HYBRID',
    metadata: { key: 'value' },
    createdAt: new Date('2026-11-24T12:00:00.000Z'),
  };

  describe('PrismaAiConversationCitationMapper', () => {
    it('1. maps Prisma record to domain entity and preserves all properties', () => {
      const entity = PrismaAiConversationCitationMapper.toDomain(
        mockDbCitation as unknown as Parameters<
          typeof PrismaAiConversationCitationMapper.toDomain
        >[0],
      );

      expect(entity.id.value).toBe(citationId);
      expect(entity.messageId.value).toBe(messageId);
      expect(entity.turnId.value).toBe(turnId);
      expect(entity.conversationId.value).toBe(conversationId);
      expect(entity.tenantId).toBe(tenantId);
      expect(entity.documentId).toBe('doc_123');
      expect(entity.documentVersionId).toBe('dver_123');
      expect(entity.chunkId).toBe('chunk_123');
      expect(entity.citationPosition).toBe(1);
      expect(entity.documentTitleSnapshot).toBe('Kinesiology Manual');
      expect(entity.excerpt).toBe(mockDbCitation.excerpt);
      expect(entity.pageNumber).toBe(42);
      expect(entity.headingPath).toEqual(['Chapter 4', 'Decompression Protocols']);
      expect(entity.retrievalRank).toBe(1);
      expect(entity.relevanceScore).toBe(0.95);
      expect(entity.sourceStrategy).toBe('HYBRID');
      expect(entity.metadata).toEqual({ key: 'value' });
    });

    it('2. maps domain entity to Prisma create input', () => {
      const entity = AiConversationCitation.reconstitute({
        id: citationId,
        messageId,
        turnId,
        conversationId,
        tenantId,
        documentId: 'doc_123',
        documentVersionId: 'dver_123',
        chunkId: 'chunk_123',
        citationPosition: 1,
        documentTitleSnapshot: 'Kinesiology Manual',
        excerpt: 'Decompression protocol excerpt',
        pageNumber: 42,
        headingPath: ['Chapter 4'],
        retrievalRank: 1,
        relevanceScore: 0.95,
        sourceStrategy: 'HYBRID',
        metadata: { key: 'value' },
        createdAt: new Date(),
      });

      const prismaCreate = PrismaAiConversationCitationMapper.toPrismaCreate(entity);

      expect(prismaCreate.id).toBe(citationId);
      expect(prismaCreate.citationPosition).toBe(1);
      expect(prismaCreate.documentTitleSnapshot).toBe('Kinesiology Manual');
      expect(prismaCreate.excerpt).toBe('Decompression protocol excerpt');
      expect(prismaCreate.pageNumber).toBe(42);
      expect(prismaCreate.headingPath).toEqual(['Chapter 4']);
      expect(prismaCreate.retrievalRank).toBe(1);
      expect(prismaCreate.relevanceScore).toBe(0.95);
      expect(prismaCreate.sourceStrategy).toBe('HYBRID');
    });
  });

  describe('PrismaAiConversationCitationRepository', () => {
    let mockPrisma: {
      aiConversationCitation: {
        create: jest.Mock;
        createMany: jest.Mock;
        upsert: jest.Mock;
        findFirst: jest.Mock;
        findMany: jest.Mock;
        deleteMany: jest.Mock;
      };
    };
    let repo: PrismaAiConversationCitationRepository;

    beforeEach(() => {
      mockPrisma = {
        aiConversationCitation: {
          create: jest.fn(),
          createMany: jest.fn(),
          upsert: jest.fn(),
          findFirst: jest.fn(),
          findMany: jest.fn(),
          deleteMany: jest.fn(),
        },
      };
      repo = new PrismaAiConversationCitationRepository(mockPrisma as unknown as PrismaClient);
    });

    it('3. save persists citation and returns domain entity', () => {
      const entity = AiConversationCitation.create({
        id: citationId,
        messageId,
        turnId,
        conversationId,
        tenantId,
        documentId: 'doc_123',
        citationPosition: 1,
        documentTitleSnapshot: 'Manual',
        excerpt: 'Excerpt text',
      });

      mockPrisma.aiConversationCitation.upsert.mockReturnValue(Promise.resolve(mockDbCitation));

      return repo.save(entity).then((saved) => {
        expect(mockPrisma.aiConversationCitation.upsert).toHaveBeenCalledTimes(1);
        expect(saved.id.value).toBe(citationId);
      });
    });

    it('4. saveMany batches insertions via upsert and returns domain entities', () => {
      const entity1 = AiConversationCitation.create({
        id: 'cite_1',
        messageId,
        turnId,
        conversationId,
        tenantId,
        documentId: 'doc_123',
        citationPosition: 1,
        documentTitleSnapshot: 'Manual',
        excerpt: 'Excerpt text 1',
      });
      const entity2 = AiConversationCitation.create({
        id: 'cite_2',
        messageId,
        turnId,
        conversationId,
        tenantId,
        documentId: 'doc_456',
        citationPosition: 2,
        documentTitleSnapshot: 'Manual 2',
        excerpt: 'Excerpt text 2',
      });

      mockPrisma.aiConversationCitation.upsert
        .mockReturnValueOnce(
          Promise.resolve({ ...mockDbCitation, id: 'cite_1', citationPosition: 1 }),
        )
        .mockReturnValueOnce(
          Promise.resolve({ ...mockDbCitation, id: 'cite_2', citationPosition: 2 }),
        );

      return repo.saveMany([entity1, entity2]).then((results) => {
        expect(mockPrisma.aiConversationCitation.upsert).toHaveBeenCalledTimes(2);
        expect(results).toHaveLength(2);
        expect(results[0]?.citationPosition).toBe(1);
        expect(results[1]?.citationPosition).toBe(2);
      });
    });

    it('5. findById enforces tenant, conversation, and message isolation boundaries', () => {
      mockPrisma.aiConversationCitation.findFirst.mockReturnValue(Promise.resolve(mockDbCitation));

      return repo.findById(tenantId, conversationId, messageId, citationId).then((result) => {
        expect(mockPrisma.aiConversationCitation.findFirst).toHaveBeenCalledWith({
          where: {
            id: citationId,
            messageId,
            conversationId,
            tenantId,
          },
        });
        expect(result).not.toBeNull();
        expect(result!.id.value).toBe(citationId);
      });
    });

    it('6. listByMessage enforces deterministic ordering by citationPosition ASC', () => {
      mockPrisma.aiConversationCitation.findMany.mockReturnValue(
        Promise.resolve([
          { ...mockDbCitation, id: 'cite_1', citationPosition: 1 },
          { ...mockDbCitation, id: 'cite_2', citationPosition: 2 },
        ]),
      );

      return repo.listByMessage(tenantId, conversationId, messageId).then((results) => {
        expect(mockPrisma.aiConversationCitation.findMany).toHaveBeenCalledWith({
          where: {
            tenantId,
            conversationId,
            messageId,
          },
          orderBy: {
            citationPosition: 'asc',
          },
        });
        expect(results).toHaveLength(2);
      });
    });

    it('7. deleteByMessage deletes all citations for a specific message within tenant', () => {
      mockPrisma.aiConversationCitation.deleteMany.mockReturnValue(Promise.resolve({ count: 3 }));

      return repo.deleteByMessage(tenantId, conversationId, messageId).then((count) => {
        expect(mockPrisma.aiConversationCitation.deleteMany).toHaveBeenCalledWith({
          where: {
            tenantId,
            conversationId,
            messageId,
          },
        });
        expect(count).toBe(3);
      });
    });
  });
});
