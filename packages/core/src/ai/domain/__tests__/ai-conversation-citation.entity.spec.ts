import { AiConversationCitation } from '../models/ai-conversation-citation.entity';
import { CitationId } from '../value-objects/citation-id.vo';
import { MessageId } from '../value-objects/message-id.vo';
import { TurnId } from '../value-objects/turn-id.vo';
import { ConversationId } from '../value-objects/conversation-id.vo';
import {
  InvalidConversationTurnException,
  InvalidMessageInvariantException,
} from '../exceptions/conversation.exceptions';

describe('AiConversationCitation Domain Entity', () => {
  const validProps = {
    messageId: 'msg_018f3a5e-b5c6-7a1b-9f0e-1a2b3c4d5e6f',
    turnId: 'turn_018f3a5e-b5c6-7a1b-9f0e-1a2b3c4d5e6f',
    conversationId: 'conv_018f3a5e-b5c6-7a1b-9f0e-1a2b3c4d5e6f',
    tenantId: 'tenant_018f3a5e-b5c6-7a1b-9f0e-1a2b3c4d5e6f',
    documentId: 'doc_018f3a5e-b5c6-7a1b-9f0e-1a2b3c4d5e6f',
    documentVersionId: 'dver_018f3a5e-b5c6-7a1b-9f0e-1a2b3c4d5e6f',
    chunkId: 'chunk_018f3a5e-b5c6-7a1b-9f0e-1a2b3c4d5e6f',
    citationPosition: 1,
    documentTitleSnapshot: 'Kinesiology Clinical Protocol',
    excerpt: 'Cervical spine mobilization should be performed with gentle progressive traction.',
    pageNumber: 14,
    headingPath: ['Section 2: Spinal Care', 'Protocol 2.1: Traction'],
    retrievalRank: 1,
    relevanceScore: 0.942,
    sourceStrategy: 'HYBRID',
  };

  it('1. successfully instantiates a valid AiConversationCitation aggregate', () => {
    const citation = AiConversationCitation.create(validProps);

    expect(citation).toBeDefined();
    expect(citation.id).toBeInstanceOf(CitationId);
    expect(citation.messageId).toBeInstanceOf(MessageId);
    expect(citation.messageId.value).toBe(validProps.messageId);
    expect(citation.turnId).toBeInstanceOf(TurnId);
    expect(citation.turnId.value).toBe(validProps.turnId);
    expect(citation.conversationId).toBeInstanceOf(ConversationId);
    expect(citation.conversationId.value).toBe(validProps.conversationId);
    expect(citation.tenantId).toBe(validProps.tenantId);
    expect(citation.documentId).toBe(validProps.documentId);
    expect(citation.documentVersionId).toBe(validProps.documentVersionId);
    expect(citation.chunkId).toBe(validProps.chunkId);
    expect(citation.citationPosition).toBe(1);
    expect(citation.documentTitleSnapshot).toBe(validProps.documentTitleSnapshot);
    expect(citation.excerpt).toBe(validProps.excerpt);
    expect(citation.pageNumber).toBe(14);
    expect(citation.headingPath).toEqual(validProps.headingPath);
    expect(citation.retrievalRank).toBe(1);
    expect(citation.relevanceScore).toBe(0.942);
    expect(citation.sourceStrategy).toBe('HYBRID');
    expect(citation.createdAt).toBeInstanceOf(Date);
  });

  it('2. enforces 1-based citationPosition invariant (rejects <= 0 and non-integers)', () => {
    expect(() =>
      AiConversationCitation.create({
        ...validProps,
        citationPosition: 0,
      }),
    ).toThrow(InvalidMessageInvariantException);

    expect(() =>
      AiConversationCitation.create({
        ...validProps,
        citationPosition: -1,
      }),
    ).toThrow(InvalidMessageInvariantException);

    expect(() =>
      AiConversationCitation.create({
        ...validProps,
        citationPosition: 1.5,
      }),
    ).toThrow(InvalidMessageInvariantException);
  });

  it('3. enforces non-empty excerpt invariant', () => {
    expect(() =>
      AiConversationCitation.create({
        ...validProps,
        excerpt: '',
      }),
    ).toThrow(InvalidMessageInvariantException);

    expect(() =>
      AiConversationCitation.create({
        ...validProps,
        excerpt: '   ',
      }),
    ).toThrow(InvalidMessageInvariantException);
  });

  it('4. enforces non-empty documentTitleSnapshot and documentId invariants', () => {
    expect(() =>
      AiConversationCitation.create({
        ...validProps,
        documentTitleSnapshot: '',
      }),
    ).toThrow(InvalidMessageInvariantException);

    expect(() =>
      AiConversationCitation.create({
        ...validProps,
        documentId: '',
      }),
    ).toThrow(InvalidMessageInvariantException);

    expect(() =>
      AiConversationCitation.create({
        ...validProps,
        tenantId: '',
      }),
    ).toThrow(InvalidConversationTurnException);
  });

  it('5. enforces relevanceScore bounded in [0.0, 1.0]', () => {
    expect(() =>
      AiConversationCitation.create({
        ...validProps,
        relevanceScore: -0.1,
      }),
    ).toThrow(InvalidMessageInvariantException);

    expect(() =>
      AiConversationCitation.create({
        ...validProps,
        relevanceScore: 1.05,
      }),
    ).toThrow(InvalidMessageInvariantException);

    const validScore = AiConversationCitation.create({
      ...validProps,
      relevanceScore: 0.0,
    });
    expect(validScore.relevanceScore).toBe(0.0);

    const validScoreMax = AiConversationCitation.create({
      ...validProps,
      relevanceScore: 1.0,
    });
    expect(validScoreMax.relevanceScore).toBe(1.0);
  });

  it('6. enforces pageNumber positive integer invariant when present', () => {
    expect(() =>
      AiConversationCitation.create({
        ...validProps,
        pageNumber: 0,
      }),
    ).toThrow(InvalidMessageInvariantException);

    expect(() =>
      AiConversationCitation.create({
        ...validProps,
        pageNumber: -5,
      }),
    ).toThrow(InvalidMessageInvariantException);

    expect(() =>
      AiConversationCitation.create({
        ...validProps,
        pageNumber: 2.7,
      }),
    ).toThrow(InvalidMessageInvariantException);

    const noPage = AiConversationCitation.create({
      ...validProps,
      pageNumber: null,
    });
    expect(noPage.pageNumber).toBeNull();
  });

  it('7. reconstitutes an immutable entity correctly from persisted properties', () => {
    const fixedDate = new Date('2026-11-24T18:00:00.000Z');
    const citation = AiConversationCitation.reconstitute({
      id: 'cite_12345',
      messageId: validProps.messageId,
      turnId: validProps.turnId,
      conversationId: validProps.conversationId,
      tenantId: validProps.tenantId,
      documentId: validProps.documentId,
      documentVersionId: validProps.documentVersionId,
      chunkId: validProps.chunkId,
      citationPosition: 2,
      documentTitleSnapshot: 'Historic Document Snapshot',
      excerpt: 'Persisted evidence excerpt',
      pageNumber: 3,
      headingPath: ['Heading 1'],
      retrievalRank: 2,
      relevanceScore: 0.88,
      sourceStrategy: 'SEMANTIC',
      metadata: { originalHash: 'abc123' },
      createdAt: fixedDate,
    });

    expect(citation.id.value).toBe('cite_12345');
    expect(citation.citationPosition).toBe(2);
    expect(citation.documentTitleSnapshot).toBe('Historic Document Snapshot');
    expect(citation.createdAt).toEqual(fixedDate);
    expect(citation.metadata).toEqual({ originalHash: 'abc123' });
    expect(Object.isFrozen(citation)).toBe(true);
    expect(Object.isFrozen(citation.headingPath)).toBe(true);
  });
});
