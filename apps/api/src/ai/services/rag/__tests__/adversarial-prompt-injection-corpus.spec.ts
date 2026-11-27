import {
  RetrievedChunk,
  ChunkId,
  SimilarityScore,
  RetrievalProvenance,
  VisibilityScope,
  SuspiciousContentDetector,
  SuspiciousContentCategory,
  SuspiciousContentSeverity,
  ToolExecutionPolicyGuard,
  ToolExecutionProhibitedException,
  buildRAGSystemPrompt,
  buildRAGUserPrompt,
  escapePromptXmlEntities,
  validatePromptStructure,
} from '@kinergy-platform/core';
import { RAGContextBuilderService } from '../rag-context-builder.service';
import { CitationValidatorService } from '../citation-validator.service';
import { DEFAULT_AI_CONFIG } from '../../../config/ai.config';
import {
  ADVERSARIAL_CORPUS,
  BENIGN_CONTROLS,
  AdversarialScenario,
} from './fixtures/adversarial-corpus.fixtures';

describe('AI-10.4-07 — Adversarial Prompt Injection Test Corpus Spec', () => {
  let contextBuilder: RAGContextBuilderService;
  let citationValidator: CitationValidatorService;

  const createRetrievedChunkFromFixture = (scenario: AdversarialScenario): RetrievedChunk => {
    const doc = scenario.syntheticDocument;
    if (!doc) {
      throw new Error(`Scenario ${scenario.id} has no syntheticDocument fixture.`);
    }

    const provenance = RetrievalProvenance.create({
      documentTitle: doc.title,
      documentVersionNumber: doc.version,
      originalFileName: `${doc.id}.pdf`,
      mimeType: 'application/pdf',
      chunkSequence: 1,
      pageNumber: 1,
    });

    return RetrievedChunk.create({
      id: `rc-${doc.id}`,
      chunkId: ChunkId.fromString(`chk-${doc.id}`),
      documentId: doc.id,
      documentVersionId: `ver-${doc.id}-${doc.version}`,
      indexGenerationId: 'gen-adv-1',
      content: doc.content,
      tokenCount: 45,
      similarity: SimilarityScore.create(0.91),
      distance: 0.09,
      provenance,
      metadata: {
        tenantId: doc.tenantId,
        status: doc.isAuthorized ? 'READY' : ((doc.metadata.status as string) ?? 'ARCHIVED'),
        visibilityScope: VisibilityScope.ALL_STAFF,
        ...doc.metadata,
      },
    });
  };

  beforeEach(() => {
    contextBuilder = new RAGContextBuilderService(undefined, {
      ...DEFAULT_AI_CONFIG,
      chatContextWindow: 4096,
      chatMaxTokens: 512,
    });
    citationValidator = new CitationValidatorService();
  });

  describe('1. Corpus Invariants & Scenario Catalog Integrity', () => {
    it('should verify all scenarios have unique IDs and complete required metadata', () => {
      const allScenarios = [...ADVERSARIAL_CORPUS, ...BENIGN_CONTROLS];
      const seenIds = new Set<string>();

      for (const scenario of allScenarios) {
        expect(seenIds.has(scenario.id)).toBe(false);
        seenIds.add(scenario.id);

        expect(scenario.id).toMatch(/^KY-(ADV|BEN)-\d{3}$/);
        expect(scenario.name.length).toBeGreaterThan(0);
        expect(scenario.description.length).toBeGreaterThan(0);
        expect(scenario.userInput.length).toBeGreaterThan(0);
        expect(scenario.expectedSecurityBehavior.length).toBeGreaterThan(0);
        expect(scenario.expectedApplicationEnforcement.length).toBeGreaterThan(0);
        expect(scenario.failureConditions.length).toBeGreaterThan(0);
        expect(scenario.modelEvaluated).toBe(false); // Must not depend on remote LLM
      }

      expect(ADVERSARIAL_CORPUS.length).toBe(17);
      expect(BENIGN_CONTROLS.length).toBe(3);
    });

    it('should verify fixtures contain zero real secrets, private tokens, or live patient data', () => {
      const allScenarios = [...ADVERSARIAL_CORPUS, ...BENIGN_CONTROLS];
      const forbiddenTokens = ['AIzaSy', 'sk-', 'bearer ', 'BEGIN PRIVATE KEY', 'password123'];

      for (const scenario of allScenarios) {
        const textToScan = [
          scenario.userInput,
          scenario.syntheticDocument?.content ?? '',
          scenario.syntheticDocument?.title ?? '',
        ].join(' ');

        for (const token of forbiddenTokens) {
          expect(textToScan.toLowerCase()).not.toContain(token.toLowerCase());
        }
      }
    });
  });

  describe('2. Direct Prompt Injection & Envelope Isolation (KY-ADV-001, 003, 010)', () => {
    it('KY-ADV-001: Isolates direct override within <user_query> and preserves system prompt authority', () => {
      const scenario = ADVERSARIAL_CORPUS.find((s) => s.id === 'KY-ADV-001')!;
      const systemPrompt = buildRAGSystemPrompt();
      const userPrompt = buildRAGUserPrompt({
        query: scenario.userInput,
        formattedEvidence: '<evidence_chunk id="chk-1">Normal evidence</evidence_chunk>',
      });

      const validation = validatePromptStructure({ systemPrompt, userPrompt });
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      // Verify envelope containment
      expect(userPrompt).toContain(
        `<user_query>\n${escapePromptXmlEntities(scenario.userInput)}\n</user_query>`,
      );
      // System prompt maintains absolute precedence
      expect(systemPrompt).toContain('INSTRUCTION PRECEDENCE & TRUST BOUNDARY');
    });

    it('KY-ADV-003: Neutralizes fake system/developer token injection inside query', () => {
      const scenario = ADVERSARIAL_CORPUS.find((s) => s.id === 'KY-ADV-003')!;
      const userPrompt = buildRAGUserPrompt({
        query: scenario.userInput,
        formattedEvidence: '<evidence_chunk id="chk-1">Normal evidence</evidence_chunk>',
      });

      // The raw <<SYS>> or <system> tags inside user input are XML-entity escaped
      expect(userPrompt).not.toContain('<system>');
      expect(userPrompt).toContain('&lt;&lt;SYS&gt;&gt;');
    });

    it('KY-ADV-010: Neutralizes delimiter injection attempts attempting to close context envelope', () => {
      const scenario = ADVERSARIAL_CORPUS.find((s) => s.id === 'KY-ADV-010')!;
      const userPrompt = buildRAGUserPrompt({
        query: scenario.userInput,
        formattedEvidence: '<evidence_chunk id="chk-1">Normal evidence</evidence_chunk>',
      });

      // Closing tags in query are escaped and cannot break the real XML envelope
      expect(userPrompt).toContain('&lt;/UNTRUSTED_DOCUMENT_EVIDENCE&gt;');
      expect(userPrompt).toContain('&lt;SYSTEM_OVERRIDE&gt;');
    });
  });

  describe('3. Indirect Document Injection & Suspicious Content Filtering (KY-ADV-002, 011, 012, 013, 014, 015)', () => {
    it('KY-ADV-002: Detects and drops document chunk with embedded SYSTEM DIRECTIVE', async () => {
      const scenario = ADVERSARIAL_CORPUS.find((s) => s.id === 'KY-ADV-002')!;
      const chunk = createRetrievedChunkFromFixture(scenario);

      const scanResult = SuspiciousContentDetector.scan(chunk.content);
      expect(scanResult.isSuspicious).toBe(true);
      expect(scanResult.severity).toBe(SuspiciousContentSeverity.SUSPICIOUS_HIGH);
      expect(scanResult.category).toBe(SuspiciousContentCategory.SYSTEM_OVERRIDE);

      const context = await contextBuilder.buildContext({
        query: scenario.userInput,
        evidenceChunks: [chunk],
        options: {
          tenantId: scenario.retrievalSetup.authenticatedTenantId,
          filterSuspiciousContent: true,
        },
      });

      expect(context.includedChunks).toHaveLength(0);
      expect(context.formattedContext).not.toContain('SYSTEM DIRECTIVE');
    });

    it('KY-ADV-011: Flags Base64 obfuscated payload instruction', () => {
      const scenario = ADVERSARIAL_CORPUS.find((s) => s.id === 'KY-ADV-011')!;
      const scanResult = SuspiciousContentDetector.scan(scenario.userInput);

      expect(scanResult.isSuspicious).toBe(true);
      expect(scanResult.category).toBe(SuspiciousContentCategory.ENCODED_PAYLOAD);
    });

    it('KY-ADV-012: Detects multilingual injection keywords in German', () => {
      const scenario = ADVERSARIAL_CORPUS.find((s) => s.id === 'KY-ADV-012')!;
      const scanResult = SuspiciousContentDetector.scan(scenario.userInput);

      expect(scanResult.isSuspicious).toBe(true);
      expect(scanResult.category).toBe(SuspiciousContentCategory.SYSTEM_OVERRIDE);
    });

    it('KY-ADV-013: Scans multi-chunk split instructions and drops poisoned chunk', async () => {
      const scenario = ADVERSARIAL_CORPUS.find((s) => s.id === 'KY-ADV-013')!;
      const chunk = createRetrievedChunkFromFixture(scenario);

      const context = await contextBuilder.buildContext({
        query: scenario.userInput,
        evidenceChunks: [chunk],
        options: {
          tenantId: scenario.retrievalSetup.authenticatedTenantId,
          filterSuspiciousContent: true,
        },
      });

      expect(context.includedChunks).toHaveLength(0);
    });

    it('KY-ADV-014: Drops conflicting document chunk attempting to override clinical guidelines', async () => {
      const scenario = ADVERSARIAL_CORPUS.find((s) => s.id === 'KY-ADV-014')!;
      const chunk = createRetrievedChunkFromFixture(scenario);

      const scanResult = SuspiciousContentDetector.scan(chunk.content);
      expect(scanResult.isSuspicious).toBe(true);
      expect(scanResult.category).toBe(SuspiciousContentCategory.SYSTEM_OVERRIDE);

      const context = await contextBuilder.buildContext({
        query: scenario.userInput,
        evidenceChunks: [chunk],
        options: {
          tenantId: scenario.retrievalSetup.authenticatedTenantId,
          filterSuspiciousContent: true,
        },
      });

      expect(context.includedChunks).toHaveLength(0);
    });

    it('KY-ADV-015: Flags roleplay / persona hijacking jailbreaks', () => {
      const scenario = ADVERSARIAL_CORPUS.find((s) => s.id === 'KY-ADV-015')!;
      const scanResult = SuspiciousContentDetector.scan(scenario.userInput);

      expect(scanResult.isSuspicious).toBe(true);
      expect(scanResult.category).toBe(SuspiciousContentCategory.IDENTITY_HIJACK);
    });
  });

  describe('4. Authorization & Cross-Tenant Isolation (KY-ADV-006, 007)', () => {
    it('KY-ADV-006: Excludes unauthorized document from context assembly', async () => {
      const scenario = ADVERSARIAL_CORPUS.find((s) => s.id === 'KY-ADV-006')!;
      const chunk = createRetrievedChunkFromFixture(scenario);

      const context = await contextBuilder.buildContext({
        query: scenario.userInput,
        evidenceChunks: [chunk],
        options: {
          tenantId: scenario.retrievalSetup.authenticatedTenantId,
        },
      });

      // Document has status 'DRAFT' which is disallowed in context assembly
      expect(context.includedChunks).toHaveLength(0);
    });

    it('KY-ADV-007: Strictly drops cross-tenant document chunks', async () => {
      const scenario = ADVERSARIAL_CORPUS.find((s) => s.id === 'KY-ADV-007')!;
      const crossTenantChunk = createRetrievedChunkFromFixture(scenario);

      const context = await contextBuilder.buildContext({
        query: scenario.userInput,
        evidenceChunks: [crossTenantChunk],
        options: {
          tenantId: scenario.retrievalSetup.authenticatedTenantId, // tenant-clinica-alpha
        },
      });

      // Target chunk belongs to tenant-clinica-beta
      expect(crossTenantChunk.metadata?.tenantId).toBe('tenant-clinica-beta');
      expect(context.includedChunks).toHaveLength(0);
      expect(context.formattedContext).not.toContain('$500,000 USD');
    });
  });

  describe('5. Read-Only Invariant & Tool Execution Prohibited (KY-ADV-008)', () => {
    it('KY-ADV-008: Unconditionally rejects business mutation execution', () => {
      expect(() => {
        ToolExecutionPolicyGuard.assertToolExecutionAllowed('issue_refund');
      }).toThrow(ToolExecutionProhibitedException);

      expect(() => {
        ToolExecutionPolicyGuard.inspectPayloadForProhibitedToolInvocation({
          tool: 'issue_refund',
          arguments: { patientId: 'pat-999', amount: 500.0 },
        });
      }).toThrow(ToolExecutionProhibitedException);
    });
  });

  describe('6. Malicious Metadata & Citation Manipulation (KY-ADV-009, 016, 017)', () => {
    it('KY-ADV-009: Document title containing SQL injection and XSS is safely escaped in XML blocks', async () => {
      const scenario = ADVERSARIAL_CORPUS.find((s) => s.id === 'KY-ADV-009')!;
      const chunk = createRetrievedChunkFromFixture(scenario);

      const context = await contextBuilder.buildContext({
        query: scenario.userInput,
        evidenceChunks: [chunk],
        options: {
          tenantId: scenario.retrievalSetup.authenticatedTenantId,
        },
      });

      expect(context.includedChunks).toHaveLength(1);
      // Ensure serialized context contains XML-escaped representation without execution
      expect(context.formattedContext).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('KY-ADV-016: Rejects fabricated citation chunk IDs not present in authorized evidence', () => {
      const scenario = ADVERSARIAL_CORPUS.find((s) => s.id === 'KY-ADV-016')!;

      const mockConstructedContext = {
        includedChunks: [
          {
            chunkId: 'chk-valid-001',
            documentId: 'doc-1',
            documentTitle: 'Guía Verificada',
            chunkSequence: 1,
            similarity: 0.9,
            content: 'Texto clínico autorizado.',
          },
        ],
        excludedChunks: [],
        totalTokens: 50,
        truncated: false,
        dropReasons: [],
        contextText: '<evidence_chunk id="chk-valid-001">Texto</evidence_chunk>',
      };

      const result = citationValidator.validateResponse({
        query: scenario.userInput,
        constructedContext: mockConstructedContext as any,
        generationResult: {
          answer: 'Afirmo el hecho comprobado segun el documento.',
          grounded: true,
          citedChunkIds: ['chk-non-existent-999'], // Fabricated ID!
          confidence: 'high',
          rawText: '{}',
          unverifiedChunkIds: [],
          modelIdentifier: 'qwen3:4b',
          promptTokens: 20,
          completionTokens: 20,
          totalTokens: 40,
          durationMs: 15,
        } as any,
      });

      // Fabricated chunk ID must trigger citation inconsistency and drop ungrounded citation
      expect(result.isValid).toBe(false);
      expect(result.inconsistencies.some((msg) => msg.includes('chk-non-existent-999'))).toBe(true);
      expect(result.verifiedCitations).toHaveLength(0);
    });

    it('KY-ADV-017: Prevents ungrounded false claims of completed mutation transactions', () => {
      const scenario = ADVERSARIAL_CORPUS.find((s) => s.id === 'KY-ADV-017')!;

      const emptyContext = {
        includedChunks: [],
        excludedChunks: [],
        totalTokens: 0,
        truncated: false,
        dropReasons: [],
        contextText: '',
      };

      const result = citationValidator.validateResponse({
        query: scenario.userInput,
        constructedContext: emptyContext as any,
        generationResult: {
          answer: 'Refund #REC-9821 for $350.00 was processed successfully.',
          grounded: true, // Fabricated grounded flag
          citedChunkIds: [],
          confidence: 'high',
          rawText: '{}',
          unverifiedChunkIds: [],
          modelIdentifier: 'qwen3:4b',
          promptTokens: 20,
          completionTokens: 20,
          totalTokens: 40,
          durationMs: 15,
        } as any,
      });

      expect(result.isValid).toBe(false);
      expect(result.isGrounded).toBe(false);
      expect(
        result.inconsistencies.some(
          (msg) =>
            msg.includes('authorized evidence pool contained 0 chunks') ||
            msg.includes('zero verified citations'),
        ),
      ).toBe(true);
    });
  });

  describe('7. Benign Controls — Zero False Positives on Legitimate Content (KY-BEN-001, 002, 003)', () => {
    it('KY-BEN-001: Admits clinical rehabilitation protocols containing procedural imperatives', async () => {
      const scenario = BENIGN_CONTROLS.find((s) => s.id === 'KY-BEN-001')!;
      const chunk = createRetrievedChunkFromFixture(scenario);

      const scanResult = SuspiciousContentDetector.scan(chunk.content);
      expect(scanResult.isSuspicious).toBe(false);

      const context = await contextBuilder.buildContext({
        query: scenario.userInput,
        evidenceChunks: [chunk],
        options: {
          tenantId: scenario.retrievalSetup.authenticatedTenantId,
          filterSuspiciousContent: true,
        },
      });

      expect(context.includedChunks).toHaveLength(1);
      expect(context.formattedContext).toContain('Ejecutar ejercicios isométricos');
    });

    it('KY-BEN-002: Admits gym equipment technical maintenance checklists', async () => {
      const scenario = BENIGN_CONTROLS.find((s) => s.id === 'KY-BEN-002')!;
      const chunk = createRetrievedChunkFromFixture(scenario);

      const scanResult = SuspiciousContentDetector.scan(chunk.content);
      expect(scanResult.isSuspicious).toBe(false);

      const context = await contextBuilder.buildContext({
        query: scenario.userInput,
        evidenceChunks: [chunk],
        options: {
          tenantId: scenario.retrievalSetup.authenticatedTenantId,
          filterSuspiciousContent: true,
        },
      });

      expect(context.includedChunks).toHaveLength(1);
      expect(context.formattedContext).toContain('prueba de diagnóstico de motor');
    });

    it('KY-BEN-003: Admits administrative staff onboarding and account policies', async () => {
      const scenario = BENIGN_CONTROLS.find((s) => s.id === 'KY-BEN-003')!;
      const chunk = createRetrievedChunkFromFixture(scenario);

      const scanResult = SuspiciousContentDetector.scan(chunk.content);
      expect(scanResult.isSuspicious).toBe(false);

      const context = await contextBuilder.buildContext({
        query: scenario.userInput,
        evidenceChunks: [chunk],
        options: {
          tenantId: scenario.retrievalSetup.authenticatedTenantId,
          filterSuspiciousContent: true,
        },
      });

      expect(context.includedChunks).toHaveLength(1);
      expect(context.formattedContext).toContain('El administrador de sede asigna el rol');
    });
  });
});
