import { RAGTurnPipelineAdapter } from '../rag-turn-pipeline.adapter';
import {
  IGenerateGroundedAnswerUseCase,
  RAGAnswer,
  RAGSourceCitation,
  GenerationCancelledException,
  ProviderTimeoutException,
  ChatMessage,
} from '@kinergy-platform/core';

describe('BE.06.01 — RAGTurnPipelineAdapter Unit Tests', () => {
  let adapter: RAGTurnPipelineAdapter;
  let mockRagOrchestrator: jest.Mocked<IGenerateGroundedAnswerUseCase>;

  const mockCitation = RAGSourceCitation.create({
    documentId: 'doc_acl_protocol_2026',
    documentTitle: 'ACL Rehabilitation Guidelines',
    chunkId: 'chunk_acl_04',
    pageNumber: 8,
    relevanceScore: 0.92,
  });

  beforeEach(() => {
    mockRagOrchestrator = {
      execute: jest.fn(),
    };
    adapter = new RAGTurnPipelineAdapter(mockRagOrchestrator);
  });

  it('1. delegates turn execution to IGenerateGroundedAnswerUseCase without passing conversationId', async () => {
    const canonicalHistory = [
      ChatMessage.user('First inquiry regarding ACL surgery'),
      ChatMessage.assistant('ACL surgery involves reconstructing the anterior cruciate ligament.'),
    ];

    const mockAnswer = RAGAnswer.create({
      answer: 'Initial open kinetic chain exercises can begin under supervision.',
      grounded: true,
      sources: [mockCitation],
      metadata: {
        model: 'ollama-med',
        retrievalCount: 2,
        latencyMs: 1200,
      },
    });

    mockRagOrchestrator.execute.mockResolvedValue(mockAnswer);

    const result = await adapter.executeTurn({
      tenantId: 'tenant_clinica_alpha',
      conversationId: 'conv_123',
      turnId: 'turn_456',
      userMessageId: 'msg_u1',
      userPrompt: 'When can open kinetic chain exercises start?',
      canonicalHistory,
      attemptId: 'msg_a2',
      attemptNumber: 1,
      actorContext: {
        userId: 'usr_doc_99',
        roles: ['Doctor'],
        permissions: ['ai:read'],
      },
      requestId: 'req-999',
      correlationId: 'corr-999',
    });

    // CRITICAL: Ensure conversationId is NOT passed to AI-08 to prevent secondary store writes
    expect(mockRagOrchestrator.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        query: 'When can open kinetic chain exercises start?',
        authContext: {
          tenantId: 'tenant_clinica_alpha',
          userId: 'usr_doc_99',
          roles: ['Doctor'],
          allowedVisibilityScopes: expect.any(Array),
        },
        conversationHistory: canonicalHistory,
      }),
    );

    const callArgs = mockRagOrchestrator.execute.mock.calls[0]?.[0];
    expect(callArgs?.conversationId).toBeUndefined();

    expect(result.outcome).toBe('SUCCESS');
    expect(result.isGrounded).toBe(true);
    expect(result.content).toBe(
      'Initial open kinetic chain exercises can begin under supervision.',
    );
    expect(result.sources).toHaveLength(1);
    expect(result.sources[0]?.documentId).toBe('doc_acl_protocol_2026');
  });

  it('2. maps abstention response with finishReason insufficient_context to outcome ABSTAINED', async () => {
    const mockAbstention = RAGAnswer.abstain('No verified documentation found.', 'none', 80);

    mockRagOrchestrator.execute.mockResolvedValue(mockAbstention);

    const result = await adapter.executeTurn({
      tenantId: 'tenant_alpha',
      conversationId: 'conv_1',
      turnId: 'turn_1',
      userMessageId: 'msg_u1',
      userPrompt: 'Tell me about an unsupported rare disease.',
      canonicalHistory: [],
      attemptId: 'msg_a1',
      attemptNumber: 1,
      actorContext: {
        userId: 'usr_1',
        roles: [],
        permissions: [],
      },
    });

    expect(result.outcome).toBe('ABSTAINED');
    expect(result.isGrounded).toBe(false);
    expect(result.content).toBe('No verified documentation found.');
  });

  it('3. catches GenerationCancelledException and returns outcome CANCELLED', async () => {
    mockRagOrchestrator.execute.mockRejectedValue(new GenerationCancelledException());

    const result = await adapter.executeTurn({
      tenantId: 'tenant_alpha',
      conversationId: 'conv_1',
      turnId: 'turn_1',
      userMessageId: 'msg_u1',
      userPrompt: 'Long prompt that got aborted',
      canonicalHistory: [],
      attemptId: 'msg_a1',
      attemptNumber: 1,
      actorContext: {
        userId: 'usr_1',
        roles: [],
        permissions: [],
      },
    });

    expect(result.outcome).toBe('CANCELLED');
    expect(result.isGrounded).toBe(false);
    expect(result.content).toBe('');
    expect(result.errorMessage).toBe('Generation was cancelled.');
  });

  it('4. catches unexpected pipeline error and returns outcome FAILED with details', async () => {
    const mockError = new Error('Local Ollama daemon unreachable on port 11434');
    (mockError as unknown as { code: string }).code = 'ECONNREFUSED';

    mockRagOrchestrator.execute.mockRejectedValue(mockError);

    const result = await adapter.executeTurn({
      tenantId: 'tenant_alpha',
      conversationId: 'conv_1',
      turnId: 'turn_1',
      userMessageId: 'msg_u1',
      userPrompt: 'Failing prompt',
      canonicalHistory: [],
      attemptId: 'msg_a1',
      attemptNumber: 1,
      actorContext: {
        userId: 'usr_1',
        roles: [],
        permissions: [],
      },
    });

    expect(result.outcome).toBe('FAILED');
    expect(result.errorCode).toBe('ECONNREFUSED');
    expect(result.errorMessage).toBe('Local Ollama daemon unreachable on port 11434');
  });

  it('5. catches ProviderTimeoutException and returns outcome FAILED with PROVIDER_TIMEOUT', async () => {
    mockRagOrchestrator.execute.mockRejectedValue(
      new ProviderTimeoutException('RAG pipeline execution timed out after 30000ms.'),
    );

    const result = await adapter.executeTurn({
      tenantId: 'tenant_alpha',
      conversationId: 'conv_1',
      turnId: 'turn_1',
      userMessageId: 'msg_u1',
      userPrompt: 'Slow prompt',
      canonicalHistory: [],
      attemptId: 'msg_a1',
      attemptNumber: 1,
      actorContext: {
        userId: 'usr_1',
        roles: [],
        permissions: [],
      },
    });

    expect(result.outcome).toBe('FAILED');
    expect(result.errorCode).toBe('PROVIDER_TIMEOUT');
    expect(result.errorMessage).toBe('RAG pipeline execution timed out after 30000ms.');
    expect(result.metadata?.finishReason).toBe('timeout');
  });

  it('6. maps all approved abstention reasons (LOW_SIMILARITY, INSUFFICIENT_EVIDENCE, CONTEXT_BUDGET_EXCEEDED) to ABSTAINED', async () => {
    const reasons = [
      'LOW_SIMILARITY',
      'INSUFFICIENT_EVIDENCE',
      'CONTEXT_BUDGET_EXCEEDED',
      'EMPTY_CHUNK_CONTENT',
      'insufficient_context',
    ];

    for (const finishReason of reasons) {
      mockRagOrchestrator.execute.mockResolvedValue(
        RAGAnswer.create({
          answer: 'Abstention response for reason ' + finishReason,
          grounded: false,
          sources: [],
          metadata: {
            model: 'none',
            retrievalCount: 0,
            latencyMs: 10,
            finishReason,
          },
        }),
      );

      const result = await adapter.executeTurn({
        tenantId: 'tenant_alpha',
        conversationId: 'conv_1',
        turnId: 'turn_1',
        userMessageId: 'msg_u1',
        userPrompt: 'Query triggering ' + finishReason,
        canonicalHistory: [],
        attemptId: 'msg_a1',
        attemptNumber: 1,
        actorContext: {
          userId: 'usr_1',
          roles: [],
          permissions: [],
        },
      });

      expect(result.outcome).toBe('ABSTAINED');
      expect(result.isGrounded).toBe(false);
      expect(result.content).toBe('Abstention response for reason ' + finishReason);
    }
  });
});
