import { CitationValidatorService } from '../citation-validator.service';
import {
  RAGConstructedContext,
  RAGEvidenceChunk,
  StructuredGenerationResult,
  RetrievedChunk,
  ChunkId,
  SimilarityScore,
  RetrievalProvenance,
} from '@kinergy-platform/core';

describe('CitationValidatorService Unit Tests', () => {
  let service: CitationValidatorService;

  const createEvidenceChunk = (
    id: string,
    content: string,
    similarity = 0.92,
    page?: number,
    headingPath?: string[],
    title = 'Manual Clínico',
  ): RAGEvidenceChunk => {
    const provenance = RetrievalProvenance.create({
      documentTitle: title,
      documentVersionNumber: 1,
      originalFileName: 'manual.pdf',
      mimeType: 'application/pdf',
      chunkSequence: 1,
      pageNumber: page,
      headingPath,
      language: 'es',
    });

    const retrieved = RetrievedChunk.create({
      id: `chunk-uuid-${id}`,
      chunkId: ChunkId.fromString(id),
      documentId: `doc-${id}`,
      documentVersionId: `ver-${id}`,
      indexGenerationId: 'gen-active-1',
      content,
      tokenCount: 25,
      similarity: SimilarityScore.create(similarity),
      distance: 1 - similarity,
      provenance,
    });

    return RAGEvidenceChunk.fromRetrievedChunk(retrieved, 1);
  };

  const createMockContext = (
    included: RAGEvidenceChunk[],
    excluded: RAGEvidenceChunk[] = [],
  ): RAGConstructedContext => {
    return RAGConstructedContext.create({
      formattedContext: '<retrieved_evidence>...</retrieved_evidence>',
      includedChunks: included,
      excludedChunks: excluded,
      totalContextTokens: 300,
      evidenceTokens: 100,
      historyTokens: 0,
      systemPromptTokens: 200,
      budgetRemaining: 3000,
      omittedChunkCount: excluded.length,
    });
  };

  const createMockGenerationResult = (props: {
    answer: string;
    grounded: boolean;
    citedChunkIds: string[];
    abstentionReason?: string;
  }): StructuredGenerationResult => {
    return StructuredGenerationResult.create({
      rawText: JSON.stringify({
        answer: props.answer,
        grounded: props.grounded,
        citedChunkIds: props.citedChunkIds,
      }),
      answer: props.answer,
      grounded: props.grounded,
      citedChunkIds: props.citedChunkIds,
      abstentionReason: props.abstentionReason,
      confidence: 'high',
      modelIdentifier: 'qwen3:4b',
      promptTokens: 100,
      completionTokens: 50,
      promptVersion: 'kinergy-rag-v1.0.0',
      finishReason: 'stop',
    });
  };

  beforeEach(() => {
    service = new CitationValidatorService();
  });

  describe('Authoritative Citation Resolution & Validation', () => {
    it('should validate and resolve authoritative metadata for legitimate citations', () => {
      const chunk1 = createEvidenceChunk(
        'chk-1',
        'El vendaje neuromuscular alivia el dolor.',
        0.95,
        12,
        ['Técnicas', 'Vendaje'],
        'Guía de Kinesiología',
      );
      const chunk2 = createEvidenceChunk(
        'chk-2',
        'La crioterapia se aplica por 15 minutos.',
        0.88,
        5,
        undefined,
        'Protocolos de Frío',
      );
      const context = createMockContext([chunk1, chunk2]);

      const genResult = createMockGenerationResult({
        answer: 'Para el dolor se aplica vendaje [chk-1] y crioterapia [chk-2].',
        grounded: true,
        citedChunkIds: ['chk-1', 'chk-2'],
      });

      const result = service.validateResponse({
        query: '¿Cómo aliviar el dolor?',
        constructedContext: context,
        generationResult: genResult,
      });

      expect(result.isValid).toBe(true);
      expect(result.isGrounded).toBe(true);
      expect(result.unverifiedChunkIds).toHaveLength(0);
      expect(result.verifiedCitations).toHaveLength(2);
      expect(result.verifiedCitations[0]?.chunkId).toBe('chk-1');
      expect(result.verifiedCitations[0]?.documentTitle).toBe('Guía de Kinesiología');
      expect(result.verifiedCitations[0]?.pageNumber).toBe(12);
      expect(result.verifiedCitations[0]?.headingPath).toEqual(['Técnicas', 'Vendaje']);
      expect(result.verifiedCitations[0]?.relevanceScore).toBe(0.95);
      expect(result.verifiedCitations[1]?.chunkId).toBe('chk-2');
      expect(result.verifiedCitations[1]?.documentTitle).toBe('Protocolos de Frío');
      expect(result.verifiedCitations[1]?.pageNumber).toBe(5);
    });

    it('should reject fabricated chunk IDs and force grounded to false if no valid citations remain', () => {
      const chunk1 = createEvidenceChunk('chk-1', 'La tendinopatía requiere reposo activo.');
      const context = createMockContext([chunk1]);

      const genResult = createMockGenerationResult({
        answer: 'Se recomienda reposo activo según el protocolo.',
        grounded: true,
        citedChunkIds: ['chk-fabricated-999'],
      });

      const result = service.validateResponse({
        query: '¿Qué hacer con la tendinopatía?',
        constructedContext: context,
        generationResult: genResult,
      });

      expect(result.isValid).toBe(false);
      expect(result.isGrounded).toBe(false);
      expect(result.abstentionReason).toBe('FABRICATED_CITATIONS');
      expect(result.unverifiedChunkIds).toContain('chk-fabricated-999');
      expect(result.verifiedCitations).toHaveLength(0);
      expect(result.inconsistencies[0]).toContain(
        "Fabricated or foreign citation 'chk-fabricated-999'",
      );
    });

    it('should reject citation to retrieved chunks that were excluded due to context budget limits', () => {
      const includedChunk = createEvidenceChunk('chk-inc', 'Ejercicio terapéutico supervisado.');
      const excludedChunk = createEvidenceChunk('chk-exc', 'Cirugía en casos refractarios.');
      const context = createMockContext([includedChunk], [excludedChunk]);

      const genResult = createMockGenerationResult({
        answer: 'Casos refractarios requieren cirugía.',
        grounded: true,
        citedChunkIds: ['chk-exc'],
      });

      const result = service.validateResponse({
        query: '¿Cuándo operar?',
        constructedContext: context,
        generationResult: genResult,
      });

      expect(result.isValid).toBe(false);
      expect(result.isGrounded).toBe(false);
      expect(result.unverifiedChunkIds).toContain('chk-exc');
      expect(result.verifiedCitations).toHaveLength(0);
      expect(result.inconsistencies.some((i) => i.includes('unused retrieved chunk'))).toBe(true);
    });

    it('should reject foreign citations from another tenant or request', () => {
      const chunk1 = createEvidenceChunk('chk-tenant-a', 'Tratamiento A');
      const context = createMockContext([chunk1]);

      const genResult = createMockGenerationResult({
        answer: 'Tratamiento B confidencial.',
        grounded: true,
        citedChunkIds: ['chk-foreign-tenant-b'],
      });

      const result = service.validateResponse({
        query: 'Tratamientos',
        constructedContext: context,
        generationResult: genResult,
      });

      expect(result.isValid).toBe(false);
      expect(result.unverifiedChunkIds).toContain('chk-foreign-tenant-b');
      expect(result.verifiedCitations).toHaveLength(0);
      expect(result.isGrounded).toBe(false);
    });
  });

  describe('Groundedness Consistency Enforcement', () => {
    it('should force grounded to false when model claims grounded: true but evidence pool is empty', () => {
      const context = createMockContext([]);

      const genResult = createMockGenerationResult({
        answer: 'Respuesta inventada sin evidencia.',
        grounded: true,
        citedChunkIds: [],
      });

      const result = service.validateResponse({
        query: '¿Qué protocolo seguir?',
        constructedContext: context,
        generationResult: genResult,
      });

      expect(result.isValid).toBe(false);
      expect(result.isGrounded).toBe(false);
      expect(result.abstentionReason).toBe('INSUFFICIENT_EVIDENCE');
      expect(result.verifiedCitations).toHaveLength(0);
    });

    it('should force grounded to false when model claims grounded: true but produces zero citations', () => {
      const chunk1 = createEvidenceChunk('chk-1', 'Contenido válido.');
      const context = createMockContext([chunk1]);

      const genResult = createMockGenerationResult({
        answer: 'Afirmación factual sin citar ninguna evidencia.',
        grounded: true,
        citedChunkIds: [],
      });

      const result = service.validateResponse({
        query: '¿Protocolo?',
        constructedContext: context,
        generationResult: genResult,
      });

      expect(result.isValid).toBe(false);
      expect(result.isGrounded).toBe(false);
      expect(result.abstentionReason).toBe('UNVERIFIED_EVIDENCE');
      expect(result.verifiedCitations).toHaveLength(0);
    });

    it('should detect explicit Spanish abstention phrasing and override grounded: true to false', () => {
      const chunk1 = createEvidenceChunk('chk-1', 'Información general.');
      const context = createMockContext([chunk1]);

      const genResult = createMockGenerationResult({
        answer:
          'No se encontró información suficiente en los documentos autorizados sobre el tema.',
        grounded: true,
        citedChunkIds: ['chk-1'],
      });

      const result = service.validateResponse({
        query: '¿Cuál es la política de reembolso?',
        constructedContext: context,
        generationResult: genResult,
      });

      expect(result.isGrounded).toBe(false);
      expect(result.abstentionReason).toBe('INSUFFICIENT_EVIDENCE');
      expect(result.verifiedCitations).toHaveLength(0);
    });

    it('should detect explicit English abstention phrasing and override grounded: true to false', () => {
      const chunk1 = createEvidenceChunk('chk-1', 'General info.');
      const context = createMockContext([chunk1]);

      const genResult = createMockGenerationResult({
        answer: "I couldn't find any verified information regarding this procedure.",
        grounded: true,
        citedChunkIds: ['chk-1'],
      });

      const result = service.validateResponse({
        query: 'Procedure details?',
        constructedContext: context,
        generationResult: genResult,
      });

      expect(result.isGrounded).toBe(false);
      expect(result.abstentionReason).toBe('INSUFFICIENT_EVIDENCE');
      expect(result.verifiedCitations).toHaveLength(0);
    });

    it('should handle missing page number gracefully without failing', () => {
      const chunkNoPage = createEvidenceChunk(
        'chk-no-page',
        'Contenido sin paginación.',
        0.85,
        undefined,
      );
      const context = createMockContext([chunkNoPage]);

      const genResult = createMockGenerationResult({
        answer: 'Contenido verificado [chk-no-page].',
        grounded: true,
        citedChunkIds: ['chk-no-page'],
      });

      const result = service.validateResponse({
        query: 'Consulta',
        constructedContext: context,
        generationResult: genResult,
      });

      expect(result.isValid).toBe(true);
      expect(result.isGrounded).toBe(true);
      expect(result.verifiedCitations[0]?.pageNumber).toBeUndefined();
    });

    it('should enforce 4000 character answer ceiling and record inconsistency if exceeded', () => {
      const chunk1 = createEvidenceChunk('chk-1', 'Contenido');
      const context = createMockContext([chunk1]);

      const longAnswer = 'A'.repeat(4500) + ' [chk-1]';
      const genResult = createMockGenerationResult({
        answer: longAnswer,
        grounded: true,
        citedChunkIds: ['chk-1'],
      });

      const result = service.validateResponse({
        query: 'Consulta larga',
        constructedContext: context,
        generationResult: genResult,
      });

      expect(result.adjustedAnswer.length).toBe(4000);
      expect(result.isValid).toBe(false);
      expect(result.inconsistencies.some((i) => i.includes('exceeds 4,000 characters'))).toBe(true);
    });
  });

  describe('Claim-Level Attribution & Conflict Preservation', () => {
    it('should extract claim-level attributions mapping statements to chunk IDs', () => {
      const chunk1 = createEvidenceChunk(
        'chk-1',
        'La sesión dura 45 minutos.',
        0.9,
        3,
        undefined,
        'Manual',
      );
      const chunk2 = createEvidenceChunk(
        'chk-2',
        'El calentamiento es de 10 minutos.',
        0.88,
        4,
        undefined,
        'Manual',
      );
      const context = createMockContext([chunk1, chunk2]);

      const genResult = createMockGenerationResult({
        answer:
          'La sesión dura 45 minutos [chk-1]. El calentamiento inicial toma 10 minutos [chk-2].',
        grounded: true,
        citedChunkIds: ['chk-1', 'chk-2'],
      });

      const result = service.validateResponse({
        query: '¿Cuánto dura la sesión?',
        constructedContext: context,
        generationResult: genResult,
      });

      expect(result.claims).toHaveLength(2);
      expect(result.claims[0]?.chunkId).toBe('chk-1');
      expect(result.claims[0]?.isVerified).toBe(true);
      expect(result.claims[0]?.documentTitle).toBe('Manual');
      expect(result.claims[0]?.pageNumber).toBe(3);

      expect(result.claims[1]?.chunkId).toBe('chk-2');
      expect(result.claims[1]?.isVerified).toBe(true);
      expect(result.claims[1]?.pageNumber).toBe(4);
    });

    it('should parse multi-citation bracket syntax correctly e.g. [chk-1, chk-2]', () => {
      const chunk1 = createEvidenceChunk('chk-1', 'Evidencia 1');
      const chunk2 = createEvidenceChunk('chk-2', 'Evidencia 2');
      const context = createMockContext([chunk1, chunk2]);

      const genResult = createMockGenerationResult({
        answer: 'Protocolo de rehabilitación combinado [chk-1, chk-2].',
        grounded: true,
        citedChunkIds: ['chk-1', 'chk-2'],
      });

      const result = service.validateResponse({
        query: 'Protocolo combinado',
        constructedContext: context,
        generationResult: genResult,
      });

      expect(result.claims).toHaveLength(2);
      expect(result.claims.map((c) => c.chunkId)).toEqual(['chk-1', 'chk-2']);
      expect(result.claims.every((c) => c.isVerified)).toBe(true);
    });

    it('should preserve conflicting sources when both are cited rather than picking sides', () => {
      const chunkA = createEvidenceChunk(
        'chk-pol-2023',
        'La política 2023 establece 3 sesiones gratuitas.',
        0.91,
        1,
        undefined,
        'Política 2023',
      );
      const chunkB = createEvidenceChunk(
        'chk-pol-2024',
        'La actualización 2024 reduce a 1 sesión gratuita.',
        0.93,
        2,
        undefined,
        'Política 2024',
      );
      const context = createMockContext([chunkA, chunkB]);

      const genResult = createMockGenerationResult({
        answer:
          'Existen dos versiones: según la Política 2023 son 3 sesiones [chk-pol-2023], mientras que la Política 2024 indica 1 sesión [chk-pol-2024].',
        grounded: true,
        citedChunkIds: ['chk-pol-2023', 'chk-pol-2024'],
      });

      const result = service.validateResponse({
        query: '¿Cuántas sesiones gratuitas corresponden?',
        constructedContext: context,
        generationResult: genResult,
      });

      expect(result.isValid).toBe(true);
      expect(result.isGrounded).toBe(true);
      expect(result.verifiedCitations).toHaveLength(2);
      expect(result.verifiedCitations.map((c) => c.documentTitle)).toEqual([
        'Política 2023',
        'Política 2024',
      ]);
    });
  });
});
