import { RAGContextBuilderService } from '../rag-context-builder.service';
import { DEFAULT_AI_CONFIG } from '../../../config/ai.config';
import {
  RAGEvidenceChunk,
  RetrievedChunk,
  ChunkId,
  SimilarityScore,
  RetrievalProvenance,
  VisibilityScope,
} from '@kinergy-platform/core';

describe('AI-10.4-04 — Context Construction and Metadata Validation Security Tests', () => {
  let contextBuilder: RAGContextBuilderService;

  const createRetrievedChunkWithMeta = (props: {
    id: string;
    docId: string;
    version?: number;
    title?: string;
    content?: string;
    tenantId?: string;
    status?: string;
    deletedAt?: Date | null;
    visibilityScope?: string;
    section?: string[];
    page?: number;
  }): RetrievedChunk => {
    const provenance = RetrievalProvenance.create({
      documentTitle: props.title ?? `Document ${props.docId}`,
      documentVersionNumber: props.version ?? 1,
      originalFileName: 'test.pdf',
      mimeType: 'application/pdf',
      chunkSequence: 1,
      pageNumber: props.page ?? 1,
      sectionHierarchy: props.section,
    });

    return RetrievedChunk.create({
      id: `rc-${props.id}`,
      chunkId: ChunkId.fromString(`chk-${props.id}`),
      documentId: props.docId,
      documentVersionId: `ver-${props.docId}-${props.version ?? 1}`,
      indexGenerationId: 'gen-1',
      content: props.content ?? 'Contenido clínico legítimo verificado.',
      tokenCount: 25,
      similarity: SimilarityScore.create(0.92),
      distance: 0.08,
      provenance,
      metadata: {
        tenantId: props.tenantId ?? 'tenant-alpha',
        status: props.status ?? 'READY',
        deletedAt: props.deletedAt ?? null,
        visibilityScope: props.visibilityScope ?? VisibilityScope.ALL_STAFF,
      },
    });
  };

  beforeEach(() => {
    contextBuilder = new RAGContextBuilderService(undefined, {
      ...DEFAULT_AI_CONFIG,
      chatContextWindow: 4096,
      chatMaxTokens: 512,
    });
  });

  describe('A. Retrieval Provenance & Identity Validation', () => {
    it('1. Authoritative Provenance: admits fully-attributed chunk with verified relationships', async () => {
      const chunk = createRetrievedChunkWithMeta({
        id: 'prov-1',
        docId: 'doc-knee-101',
        version: 2,
        title: 'Guía de Artroscopía de Rodilla',
        page: 4,
        section: ['Cirugía', 'Postoperatorio'],
      });

      const context = await contextBuilder.buildContext({
        query: 'cuidados postoperatorios',
        evidenceChunks: [chunk],
        options: {
          tenantId: 'tenant-alpha',
          allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
        },
      });

      expect(context.includedChunks).toHaveLength(1);
      const admitted = context.includedChunks[0]!;
      expect(admitted.chunkId).toBe('chk-prov-1');
      expect(admitted.documentId).toBe('doc-knee-101');
      expect(admitted.documentVersionNumber).toBe(2);
      expect(admitted.documentTitle).toBe('Guía de Artroscopía de Rodilla');
      expect(context.formattedContext).toContain('id="chk-prov-1"');
      expect(context.formattedContext).toContain('document_id="doc-knee-101"');
      expect(context.formattedContext).toContain('version="2"');
      expect(context.formattedContext).toContain('page="4"');
    });

    it('2. Missing Chunk or Document ID: fails closed when identity provenance is missing', async () => {
      const invalidChunk = Object.assign(Object.create(RAGEvidenceChunk.prototype), {
        chunkId: '',
        documentId: 'doc-1',
        documentTitle: 'Title',
        documentVersionNumber: 1,
        content: 'Texto sin chunkId',
      });

      await expect(
        contextBuilder.buildContext({
          query: 'test',
          evidenceChunks: [invalidChunk],
        }),
      ).rejects.toThrow('RAGEvidenceChunk must possess a non-empty chunkId.');
    });

    it('3. Invalid Version Number: fails closed when version is non-positive or non-integer', async () => {
      const invalidVersionChunk = Object.assign(Object.create(RAGEvidenceChunk.prototype), {
        chunkId: 'chk-inv-ver',
        documentId: 'doc-1',
        documentTitle: 'Title',
        documentVersionNumber: 0, // Invalid version
        content: 'Texto con versión 0',
      });

      await expect(
        contextBuilder.buildContext({
          query: 'test',
          evidenceChunks: [invalidVersionChunk],
        }),
      ).rejects.toThrow('RAGEvidenceChunk has invalid documentVersionNumber: 0');
    });
  });

  describe('B. Multi-Tenant and RBAC Boundary Enforcement', () => {
    it('4. Cross-Tenant Leakage Prevention: drops chunks belonging to a different tenant', async () => {
      const legitimateChunk = createRetrievedChunkWithMeta({
        id: 'legit-1',
        docId: 'doc-alpha-1',
        tenantId: 'tenant-alpha',
      });
      const foreignChunk = createRetrievedChunkWithMeta({
        id: 'foreign-1',
        docId: 'doc-beta-1',
        tenantId: 'tenant-beta', // Foreign tenant!
      });

      const context = await contextBuilder.buildContext({
        query: 'protocolo',
        evidenceChunks: [legitimateChunk, foreignChunk],
        options: {
          tenantId: 'tenant-alpha',
          allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
        },
      });

      expect(context.includedChunks).toHaveLength(1);
      expect(context.includedChunks[0]?.chunkId).toBe('chk-legit-1');
      expect(context.formattedContext).not.toContain('chk-foreign-1');
      expect(context.formattedContext).not.toContain('doc-beta-1');
    });

    it('5. Visibility Scope Clearance: drops chunks exceeding caller role clearance', async () => {
      const publicChunk = createRetrievedChunkWithMeta({
        id: 'all-staff-1',
        docId: 'doc-1',
        visibilityScope: VisibilityScope.ALL_STAFF,
      });
      const managementChunk = createRetrievedChunkWithMeta({
        id: 'mgmt-1',
        docId: 'doc-2',
        visibilityScope: VisibilityScope.MANAGEMENT,
      });

      const context = await contextBuilder.buildContext({
        query: 'políticas',
        evidenceChunks: [publicChunk, managementChunk],
        options: {
          tenantId: 'tenant-alpha',
          allowedVisibilityScopes: [VisibilityScope.ALL_STAFF], // User lacks MANAGEMENT clearance
        },
      });

      expect(context.includedChunks).toHaveLength(1);
      expect(context.includedChunks[0]?.chunkId).toBe('chk-all-staff-1');
      expect(context.formattedContext).not.toContain('chk-mgmt-1');
    });
  });

  describe('C. Lifecycle Status, Quarantine, and Version Consistency', () => {
    it('6. Quarantined and Failed Documents: drops chunks from quarantined or failed documents', async () => {
      const readyChunk = createRetrievedChunkWithMeta({
        id: 'ready-1',
        docId: 'doc-ready',
        status: 'READY',
      });
      const quarantinedChunk = createRetrievedChunkWithMeta({
        id: 'quarantine-1',
        docId: 'doc-quarantined',
        status: 'QUARANTINED',
      });
      const failedChunk = createRetrievedChunkWithMeta({
        id: 'failed-1',
        docId: 'doc-failed',
        status: 'FAILED',
      });
      const processingChunk = createRetrievedChunkWithMeta({
        id: 'proc-1',
        docId: 'doc-proc',
        status: 'PROCESSING',
      });

      const context = await contextBuilder.buildContext({
        query: 'documentos',
        evidenceChunks: [readyChunk, quarantinedChunk, failedChunk, processingChunk],
        options: {
          tenantId: 'tenant-alpha',
          allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
        },
      });

      expect(context.includedChunks).toHaveLength(1);
      expect(context.includedChunks[0]?.chunkId).toBe('chk-ready-1');
      expect(context.formattedContext).not.toContain('chk-quarantine-1');
      expect(context.formattedContext).not.toContain('chk-failed-1');
      expect(context.formattedContext).not.toContain('chk-proc-1');
    });

    it('7. Soft-Deleted Documents: drops chunks with non-null deletedAt timestamp', async () => {
      const activeChunk = createRetrievedChunkWithMeta({
        id: 'active-1',
        docId: 'doc-active',
        deletedAt: null,
      });
      const deletedChunk = createRetrievedChunkWithMeta({
        id: 'deleted-1',
        docId: 'doc-deleted',
        deletedAt: new Date(),
      });

      const context = await contextBuilder.buildContext({
        query: 'archivo',
        evidenceChunks: [activeChunk, deletedChunk],
        options: {
          tenantId: 'tenant-alpha',
          allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
        },
      });

      expect(context.includedChunks).toHaveLength(1);
      expect(context.includedChunks[0]?.chunkId).toBe('chk-active-1');
      expect(context.formattedContext).not.toContain('chk-deleted-1');
    });

    it('8. Version Consistency: drops superseded versions when a newer version exists for the same document', async () => {
      const v1Chunk = createRetrievedChunkWithMeta({
        id: 'policy-v1',
        docId: 'doc-policy-2024',
        version: 1,
        content: 'Política antigua: versión 1 con protocolo obsoleto.',
      });
      const v2Chunk = createRetrievedChunkWithMeta({
        id: 'policy-v2',
        docId: 'doc-policy-2024',
        version: 2,
        content: 'Política vigente: versión 2 con protocolo actualizado.',
      });

      const context = await contextBuilder.buildContext({
        query: 'protocolo de política',
        evidenceChunks: [v1Chunk, v2Chunk],
        options: {
          tenantId: 'tenant-alpha',
          allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
        },
      });

      // Only version 2 must be admitted; version 1 must be filtered out as superseded
      expect(context.includedChunks).toHaveLength(1);
      expect(context.includedChunks[0]?.chunkId).toBe('chk-policy-v2');
      expect(context.includedChunks[0]?.documentVersionNumber).toBe(2);
      expect(context.formattedContext).toContain('chk-policy-v2');
      expect(context.formattedContext).not.toContain('chk-policy-v1');
    });
  });

  describe('D. Metadata Sanitization, Truncation, and Context Limits', () => {
    it('9. Oversized Document Title: caps titles at 255 characters with ellipsis without breaking XML', async () => {
      const longTitle = 'A'.repeat(300);
      const chunk = createRetrievedChunkWithMeta({
        id: 'long-title-1',
        docId: 'doc-title',
        title: longTitle,
      });

      const context = await contextBuilder.buildContext({
        query: 'título largo',
        evidenceChunks: [chunk],
      });

      expect(context.includedChunks).toHaveLength(1);
      expect(context.formattedContext).toContain('title="');
      // Must not contain 300 'A's
      expect(context.formattedContext).not.toContain('A'.repeat(300));
      // Must contain truncated title ending with ...
      expect(context.formattedContext).toContain('...');
    });

    it('10. Section Hierarchy Bounds: bounds section depth to 5 levels and 300 characters', async () => {
      const deepSections = [
        'Nivel 1',
        'Nivel 2',
        'Nivel 3',
        'Nivel 4',
        'Nivel 5',
        'Nivel 6 Excedente',
        'Nivel 7 Excedente',
      ];
      const chunk = createRetrievedChunkWithMeta({
        id: 'deep-sec-1',
        docId: 'doc-sec',
        section: deepSections,
      });

      const context = await contextBuilder.buildContext({
        query: 'secciones',
        evidenceChunks: [chunk],
      });

      expect(context.includedChunks).toHaveLength(1);
      expect(context.formattedContext).toContain('Nivel 5');
      expect(context.formattedContext).not.toContain('Nivel 6 Excedente');
      expect(context.formattedContext).not.toContain('Nivel 7 Excedente');
    });

    it('11. Source Diversity Limit: enforces maxSources across distinct documents', async () => {
      const chunkDoc1 = createRetrievedChunkWithMeta({ id: 'c1', docId: 'doc-1' });
      const chunkDoc2 = createRetrievedChunkWithMeta({ id: 'c2', docId: 'doc-2' });
      const chunkDoc3 = createRetrievedChunkWithMeta({ id: 'c3', docId: 'doc-3' });

      const context = await contextBuilder.buildContext({
        query: 'diversidad',
        evidenceChunks: [chunkDoc1, chunkDoc2, chunkDoc3],
        options: {
          maxSources: 2, // Only allow 2 distinct documents
        },
      });

      expect(context.includedChunks).toHaveLength(2);
      const uniqueDocs = new Set(context.includedChunks.map((c) => c.documentId));
      expect(uniqueDocs.size).toBe(2);
      expect(context.formattedContext).toContain('doc-1');
      expect(context.formattedContext).toContain('doc-2');
      expect(context.formattedContext).not.toContain('doc-3');
    });

    it('12. Per-Source Chunk Limit: enforces maxChunksPerSource for a single document', async () => {
      const chunk1 = createRetrievedChunkWithMeta({ id: 'c1', docId: 'doc-same' });
      const chunk2 = createRetrievedChunkWithMeta({ id: 'c2', docId: 'doc-same' });
      const chunk3 = createRetrievedChunkWithMeta({ id: 'c3', docId: 'doc-same' });

      const context = await contextBuilder.buildContext({
        query: 'limite por fuente',
        evidenceChunks: [chunk1, chunk2, chunk3],
        options: {
          maxChunksPerSource: 2, // Allow max 2 chunks from same doc
        },
      });

      expect(context.includedChunks).toHaveLength(2);
      expect(context.includedChunks.map((c) => c.chunkId)).toEqual(['chk-c1', 'chk-c2']);
      expect(context.formattedContext).not.toContain('chk-c3');
    });

    it('13. Oversized Chunk Content: drops chunks exceeding maxChunkContentLength', async () => {
      const hugeContent = 'C'.repeat(15000); // 15,000 characters
      const normalContent = 'Contenido normal de tamaño moderado.';

      const hugeChunk = createRetrievedChunkWithMeta({
        id: 'huge-1',
        docId: 'doc-huge',
        content: hugeContent,
      });
      const normalChunk = createRetrievedChunkWithMeta({
        id: 'norm-1',
        docId: 'doc-norm',
        content: normalContent,
      });

      const context = await contextBuilder.buildContext({
        query: 'tamaño',
        evidenceChunks: [hugeChunk, normalChunk],
        options: {
          maxChunkContentLength: 10000,
        },
      });

      expect(context.includedChunks).toHaveLength(1);
      expect(context.includedChunks[0]?.chunkId).toBe('chk-norm-1');
      expect(context.formattedContext).not.toContain('chk-huge-1');
    });
  });
});
