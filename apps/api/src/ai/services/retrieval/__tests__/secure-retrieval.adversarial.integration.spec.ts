import { PrismaClient } from '@prisma/client';
import {
  KnowledgeDocument,
  DocumentChunk,
  DocumentEmbedding,
  IndexGeneration,
  EmbeddingProfile,
  ChunkId,
  ChunkProvenance,
  VisibilityScope,
  InvalidMetadataFilterException,
  VectorValues,
} from '@kinergy-platform/core';
import {
  PrismaKnowledgeDocumentRepository,
  PrismaKnowledgeChunkRepository,
  PrismaIndexGenerationRepository,
  PrismaVectorStoreRepository,
  PrismaSemanticRetrievalRepository,
} from '@kinergy-platform/core/server';
import { RetrievalSecurityPolicyService } from '../retrieval-security-policy.service';
import { SecureSemanticSearchService } from '../secure-semantic-search.service';
import { IQueryEmbeddingUseCase } from '@kinergy-platform/core';

describe('AI-06.4 — Secure Multi-Tenant Retrieval Adversarial Integration Tests', () => {
  let prisma: PrismaClient;
  let docRepo: PrismaKnowledgeDocumentRepository;
  let chunkRepo: PrismaKnowledgeChunkRepository;
  let genRepo: PrismaIndexGenerationRepository;
  let vectorStore: PrismaVectorStoreRepository;
  let retrievalRepo: PrismaSemanticRetrievalRepository;
  let securityPolicy: RetrievalSecurityPolicyService;
  let secureSearchService: SecureSemanticSearchService;
  let mockEmbeddingUseCase: jest.Mocked<IQueryEmbeddingUseCase>;
  let isDbAvailable = false;

  const tenantA = `sec_tenant_a_${Date.now()}`;
  const tenantB = `sec_tenant_b_${Date.now()}`;
  const tenantId = tenantA;
  const checksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  const createNormalized1024Vector = (seed: number): number[] => {
    const raw = new Array(1024).fill(0).map((_, i) => Math.sin(seed * (i + 1)));
    const norm = Math.sqrt(raw.reduce((acc, val) => acc + val * val, 0));
    return raw.map((val) => val / norm);
  };

  // Shared high-similarity vector
  const targetVector = createNormalized1024Vector(100.0);

  // Fixture IDs
  let docA_StaffId: string;
  let docA_ClinicalId: string;
  let docA_ManagementId: string;
  let docA_DeletedId: string;
  let docB_StaffId: string;

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await prisma.$queryRawUnsafe('SELECT 1');
      isDbAvailable = true;

      docRepo = new PrismaKnowledgeDocumentRepository(prisma);
      chunkRepo = new PrismaKnowledgeChunkRepository(prisma);
      genRepo = new PrismaIndexGenerationRepository(prisma);
      vectorStore = new PrismaVectorStoreRepository(prisma);
      retrievalRepo = new PrismaSemanticRetrievalRepository(prisma);
      securityPolicy = new RetrievalSecurityPolicyService(docRepo);

      mockEmbeddingUseCase = {
        generateQueryEmbedding: jest.fn().mockResolvedValue({
          vector: VectorValues.create(targetVector, 1024),
          dimensions: 1024,
          modelIdentifier: 'bge-m3:latest',
          durationMs: 10,
          normalizedQuery: 'protocolo de kinesioterapia',
        }),
      };

      secureSearchService = new SecureSemanticSearchService(
        mockEmbeddingUseCase,
        retrievalRepo,
        genRepo,
        securityPolicy,
      );

      // --- Seed Tenant A Fixtures ---
      const profile = EmbeddingProfile.bgeM3DenseDefault();

      // 1. Tenant A - ALL_STAFF document
      const docA_Staff = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Manual General de Kinesioterapia',
        uploadedBy: 'usr_admin_a',
        visibilityScope: VisibilityScope.ALL_STAFF,
      });
      const verA_Staff = docA_Staff.addVersion({
        checksum,
        storageKey: 's3://bucket/a_staff.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        originalFileName: 'a_staff.pdf',
        uploadedBy: 'usr_admin_a',
      });
      await docRepo.save(docA_Staff);
      docA_StaffId = docA_Staff.id.value;

      const chkA_Staff = DocumentChunk.create({
        id: ChunkId.createDeterministic(docA_StaffId, verA_Staff.id, 0, 'Staff Content'),
        documentId: docA_StaffId,
        documentVersionId: verA_Staff.id,
        sequence: 0,
        content: 'Protocolo general de kinesioterapia accesible a todo el personal.',
        tokenCount: 9,
        provenance: ChunkProvenance.create({
          documentId: docA_StaffId,
          documentVersionId: verA_Staff.id,
          chunkIndex: 0,
          pageNumber: 1,
          checksum,
          configurationVersion: '1.0.0',
        }),
        metadata: { department: 'kinesiology', category: 'protocols' },
      });
      await chunkRepo.saveChunks(tenantA, docA_StaffId, verA_Staff.id, [chkA_Staff]);

      // 2. Tenant A - CLINICAL_STAFF document
      const docA_Clinical = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Diagnóstico Clínico Avanzado',
        uploadedBy: 'usr_admin_a',
        visibilityScope: VisibilityScope.CLINICAL_STAFF,
      });
      const verA_Clinical = docA_Clinical.addVersion({
        checksum,
        storageKey: 's3://bucket/a_clinical.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        originalFileName: 'a_clinical.pdf',
        uploadedBy: 'usr_admin_a',
      });
      await docRepo.save(docA_Clinical);
      docA_ClinicalId = docA_Clinical.id.value;

      const chkA_Clinical = DocumentChunk.create({
        id: ChunkId.createDeterministic(docA_ClinicalId, verA_Clinical.id, 0, 'Clinical Content'),
        documentId: docA_ClinicalId,
        documentVersionId: verA_Clinical.id,
        sequence: 0,
        content: 'Evaluación biomecánica clínica reservada para fisioterapeutas colegiados.',
        tokenCount: 8,
        provenance: ChunkProvenance.create({
          documentId: docA_ClinicalId,
          documentVersionId: verA_Clinical.id,
          chunkIndex: 0,
          pageNumber: 1,
          checksum,
          configurationVersion: '1.0.0',
        }),
        metadata: { department: 'clinical', subspecialty: 'biomechanics' },
      });
      await chunkRepo.saveChunks(tenantA, docA_ClinicalId, verA_Clinical.id, [chkA_Clinical]);

      // 3. Tenant A - MANAGEMENT document
      const docA_Management = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Presupuestos y Finanzas Confidenciales',
        uploadedBy: 'usr_admin_a',
        visibilityScope: VisibilityScope.MANAGEMENT,
      });
      const verA_Management = docA_Management.addVersion({
        checksum,
        storageKey: 's3://bucket/a_mgmt.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        originalFileName: 'a_mgmt.pdf',
        uploadedBy: 'usr_admin_a',
      });
      await docRepo.save(docA_Management);
      docA_ManagementId = docA_Management.id.value;

      const chkA_Mgmt = DocumentChunk.create({
        id: ChunkId.createDeterministic(docA_ManagementId, verA_Management.id, 0, 'Mgmt Content'),
        documentId: docA_ManagementId,
        documentVersionId: verA_Management.id,
        sequence: 0,
        content: 'Estructura de compensaciones y balances confidenciales de la clínica.',
        tokenCount: 8,
        provenance: ChunkProvenance.create({
          documentId: docA_ManagementId,
          documentVersionId: verA_Management.id,
          chunkIndex: 0,
          pageNumber: 1,
          checksum,
          configurationVersion: '1.0.0',
        }),
      });
      await chunkRepo.saveChunks(tenantA, docA_ManagementId, verA_Management.id, [chkA_Mgmt]);

      // 4. Tenant A - Soft-deleted document
      const docA_Deleted = KnowledgeDocument.create({
        tenantId: tenantA,
        title: 'Protocolo Obsoleto Eliminado',
        uploadedBy: 'usr_admin_a',
        visibilityScope: VisibilityScope.ALL_STAFF,
      });
      const verA_Deleted = docA_Deleted.addVersion({
        checksum,
        storageKey: 's3://bucket/a_del.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        originalFileName: 'a_del.pdf',
        uploadedBy: 'usr_admin_a',
      });
      await docRepo.save(docA_Deleted);
      docA_DeletedId = docA_Deleted.id.value;

      const chkA_Deleted = DocumentChunk.create({
        id: ChunkId.createDeterministic(docA_DeletedId, verA_Deleted.id, 0, 'Deleted Content'),
        documentId: docA_DeletedId,
        documentVersionId: verA_Deleted.id,
        sequence: 0,
        content: 'Este contenido fue revocado y eliminado.',
        tokenCount: 6,
        provenance: ChunkProvenance.create({
          documentId: docA_DeletedId,
          documentVersionId: verA_Deleted.id,
          chunkIndex: 0,
          pageNumber: 1,
          checksum,
          configurationVersion: '1.0.0',
        }),
      });
      await chunkRepo.saveChunks(tenantA, docA_DeletedId, verA_Deleted.id, [chkA_Deleted]);

      // Soft delete docA_Deleted
      await prisma.knowledgeDocument.update({
        where: { id: docA_DeletedId },
        data: { deletedAt: new Date() },
      });

      // Active generation for Tenant A
      const genA = IndexGeneration.create({
        tenantId: tenantA,
        generationNumber: 1,
        profile,
        targetChunkCount: 4,
      });
      genA.startBuilding();
      genA.recordProgress(4);
      genA.startValidation();
      genA.activate();
      await genRepo.save(genA);

      // Embeddings for Tenant A
      await vectorStore.save(
        DocumentEmbedding.create({
          chunkId: chkA_Staff.id,
          documentId: docA_StaffId,
          documentVersionId: verA_Staff.id,
          indexGenerationId: genA.id,
          profile,
          vector: targetVector,
          contentFingerprint: 'sha256:fp_a_staff',
        }),
      );
      await vectorStore.save(
        DocumentEmbedding.create({
          chunkId: chkA_Clinical.id,
          documentId: docA_ClinicalId,
          documentVersionId: verA_Clinical.id,
          indexGenerationId: genA.id,
          profile,
          vector: targetVector,
          contentFingerprint: 'sha256:fp_a_clinical',
        }),
      );
      await vectorStore.save(
        DocumentEmbedding.create({
          chunkId: chkA_Mgmt.id,
          documentId: docA_ManagementId,
          documentVersionId: verA_Management.id,
          indexGenerationId: genA.id,
          profile,
          vector: targetVector,
          contentFingerprint: 'sha256:fp_a_mgmt',
        }),
      );
      await vectorStore.save(
        DocumentEmbedding.create({
          chunkId: chkA_Deleted.id,
          documentId: docA_DeletedId,
          documentVersionId: verA_Deleted.id,
          indexGenerationId: genA.id,
          profile,
          vector: targetVector,
          contentFingerprint: 'sha256:fp_a_del',
        }),
      );

      // --- Seed Tenant B Fixtures with Identical Vector ---
      const docB_Staff = KnowledgeDocument.create({
        tenantId: tenantB,
        title: 'Documento Secreto Tenant B',
        uploadedBy: 'usr_admin_b',
        visibilityScope: VisibilityScope.ALL_STAFF,
      });
      const verB_Staff = docB_Staff.addVersion({
        checksum,
        storageKey: 's3://bucket/b_staff.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        originalFileName: 'b_staff.pdf',
        uploadedBy: 'usr_admin_b',
      });
      await docRepo.save(docB_Staff);
      docB_StaffId = docB_Staff.id.value;

      const chkB_Staff = DocumentChunk.create({
        id: ChunkId.createDeterministic(docB_StaffId, verB_Staff.id, 0, 'Tenant B Staff Content'),
        documentId: docB_StaffId,
        documentVersionId: verB_Staff.id,
        sequence: 0,
        content: 'Propiedad intelectual confidencial de Tenant B.',
        tokenCount: 7,
        provenance: ChunkProvenance.create({
          documentId: docB_StaffId,
          documentVersionId: verB_Staff.id,
          chunkIndex: 0,
          pageNumber: 1,
          checksum,
          configurationVersion: '1.0.0',
        }),
      });
      await chunkRepo.saveChunks(tenantB, docB_StaffId, verB_Staff.id, [chkB_Staff]);

      const genB = IndexGeneration.create({
        tenantId: tenantB,
        generationNumber: 1,
        profile,
        targetChunkCount: 1,
      });
      genB.startBuilding();
      genB.recordProgress(1);
      genB.startValidation();
      genB.activate();
      await genRepo.save(genB);

      await vectorStore.save(
        DocumentEmbedding.create({
          chunkId: chkB_Staff.id,
          documentId: docB_StaffId,
          documentVersionId: verB_Staff.id,
          indexGenerationId: genB.id,
          profile,
          vector: targetVector, // Identical vector
          contentFingerprint: 'sha256:fp_b_staff',
        }),
      );
    } catch {
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (isDbAvailable && prisma) {
      for (const t of [tenantA, tenantB]) {
        await prisma.knowledgeDocument.deleteMany({ where: { tenantId: t } }).catch(() => {});
        await prisma.indexGeneration.deleteMany({ where: { tenantId: t } }).catch(() => {});
      }
      await prisma.$disconnect();
    }
  });

  // --- ADVERSARIAL SECURITY TESTS A THROUGH G ---

  it('A. Cross-Tenant Leakage Attack: Query from Tenant A must NEVER return Tenant B chunks', async () => {
    if (!isDbAvailable) return;

    // Tenant A searches with identical vector to Tenant B's chunk
    const result = await secureSearchService.execute({
      query: 'protocolo de kinesioterapia',
      authContext: {
        tenantId,
        userId: 'usr_staff_a',
        roles: ['Trainer'],
        allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
      },
      topK: 20,
    });

    expect(result.isEmpty()).toBe(false);

    // Verify 100% of returned chunks belong to Tenant A
    for (const chunk of result.chunks) {
      expect(chunk.documentId).not.toBe(docB_StaffId);
      expect(chunk.content).not.toContain('Tenant B');
    }

    // Verify that Tenant B's chunk was completely filtered at the SQL boundary
    const hasTenantBChunk = result.chunks.some((c) => c.documentId === docB_StaffId);
    expect(hasTenantBChunk).toBe(false);
  });

  it('B. Role-Based Clearance Boundary Attack: Unauthorized document chunks must NEVER appear', async () => {
    if (!isDbAvailable) return;

    // Case 1: Trainer (clearance: ALL_STAFF only)
    const trainerResult = await secureSearchService.execute({
      query: 'protocolo de kinesioterapia',
      authContext: {
        tenantId,
        userId: 'usr_trainer',
        roles: ['Trainer'],
        allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
      },
      topK: 20,
    });

    // Must return ALL_STAFF doc, but NEVER CLINICAL_STAFF or MANAGEMENT docs
    expect(trainerResult.chunks.some((c) => c.documentId === docA_StaffId)).toBe(true);
    expect(trainerResult.chunks.some((c) => c.documentId === docA_ClinicalId)).toBe(false);
    expect(trainerResult.chunks.some((c) => c.documentId === docA_ManagementId)).toBe(false);

    // Case 2: Therapist (clearance: ALL_STAFF + CLINICAL_STAFF)
    const therapistResult = await secureSearchService.execute({
      query: 'protocolo de kinesioterapia',
      authContext: {
        tenantId,
        userId: 'usr_therapist',
        roles: ['Therapist'],
        allowedVisibilityScopes: [VisibilityScope.ALL_STAFF, VisibilityScope.CLINICAL_STAFF],
      },
      topK: 20,
    });

    // Must return both ALL_STAFF and CLINICAL_STAFF, but NEVER MANAGEMENT
    expect(therapistResult.chunks.some((c) => c.documentId === docA_StaffId)).toBe(true);
    expect(therapistResult.chunks.some((c) => c.documentId === docA_ClinicalId)).toBe(true);
    expect(therapistResult.chunks.some((c) => c.documentId === docA_ManagementId)).toBe(false);

    // Case 3: Owner (clearance: ALL_STAFF + CLINICAL_STAFF + MANAGEMENT)
    const ownerResult = await secureSearchService.execute({
      query: 'protocolo de kinesioterapia',
      authContext: {
        tenantId,
        userId: 'usr_owner',
        roles: ['Owner'],
        allowedVisibilityScopes: [
          VisibilityScope.ALL_STAFF,
          VisibilityScope.CLINICAL_STAFF,
          VisibilityScope.MANAGEMENT,
        ],
      },
      topK: 20,
    });

    // Owner can access all 3 authorized document classes
    expect(ownerResult.chunks.some((c) => c.documentId === docA_StaffId)).toBe(true);
    expect(ownerResult.chunks.some((c) => c.documentId === docA_ClinicalId)).toBe(true);
    expect(ownerResult.chunks.some((c) => c.documentId === docA_ManagementId)).toBe(true);
  });

  it('C. Tenant Identifier Tampering Attack: Client cannot override server-side tenant authorization context', async () => {
    if (!isDbAvailable) return;

    // Client is authenticated as Tenant A, attempts to pass Tenant B in metadata
    const result = await secureSearchService.execute({
      query: 'protocolo de kinesioterapia',
      authContext: {
        tenantId, // Authenticated context is tenantA
        userId: 'usr_staff_a',
        roles: ['Trainer'],
        allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
      },
      // Attacker attempts to pass another tenant's document
      documentIds: [docB_StaffId],
    });

    // Must fail closed immediately: 0 results returned, zero leakage of Tenant B
    expect(result.isEmpty()).toBe(true);
    expect(result.count).toBe(0);
  });

  it('D. Malicious Metadata Filter Injection Attack: Prohibited keys & SQL fragments must be rejected', async () => {
    if (!isDbAvailable) return;

    // Attack 1: Non-allowlisted key
    await expect(
      secureSearchService.execute({
        query: 'test query',
        filterMetadata: { secret_admin_flag: 'true' },
        authContext: {
          tenantId,
          userId: 'usr_attacker',
          roles: ['Trainer'],
          allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
        },
      }),
    ).rejects.toThrow(InvalidMetadataFilterException);

    // Attack 2: SQL Injection fragment in metadata value
    await expect(
      secureSearchService.execute({
        query: 'test query',
        filterMetadata: { department: 'kinesiology; DROP TABLE document_embeddings;' },
        authContext: {
          tenantId,
          userId: 'usr_attacker',
          roles: ['Trainer'],
          allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
        },
      }),
    ).rejects.toThrow(InvalidMetadataFilterException);

    // Attack 3: SQL comment sequence in metadata value
    await expect(
      secureSearchService.execute({
        query: 'test query',
        filterMetadata: { category: 'protocols -- bypass' },
        authContext: {
          tenantId,
          userId: 'usr_attacker',
          roles: ['Trainer'],
          allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
        },
      }),
    ).rejects.toThrow(InvalidMetadataFilterException);
  });

  it('E. Zero-Knowledge Clearance Failure: When user has 0 clearance, return empty without leaking information', async () => {
    if (!isDbAvailable) return;

    const result = await secureSearchService.execute({
      query: 'protocolo de kinesioterapia',
      authContext: {
        tenantId,
        userId: 'usr_no_roles',
        roles: [], // No roles
        allowedVisibilityScopes: [], // Zero clearance
      },
    });

    expect(result.isEmpty()).toBe(true);
    expect(result.count).toBe(0);
    expect(result.chunks.length).toBe(0);
  });

  it('F. Blind Document ID Probing Attack: Probing unauthorized or foreign document IDs must not leak presence', async () => {
    if (!isDbAvailable) return;

    // Attacker probes foreign tenant doc, deleted doc, and non-existent doc
    const result = await secureSearchService.execute({
      query: 'protocolo de kinesioterapia',
      documentIds: [
        docB_StaffId, // Foreign tenant
        docA_DeletedId, // Soft-deleted
        docA_ManagementId, // Higher clearance than Trainer
        'non_existent_doc_uuid_123', // Non-existent
      ],
      authContext: {
        tenantId,
        userId: 'usr_trainer',
        roles: ['Trainer'],
        allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
      },
    });

    // Result must be strictly empty; zero confirmation of whether docB or deleted doc exists
    expect(result.isEmpty()).toBe(true);
    expect(result.count).toBe(0);
    expect(result.totalMatches).toBe(0);
  });

  it('G. Soft-Deleted Document Exclusion: Soft-deleted document chunks never leak into retrieval', async () => {
    if (!isDbAvailable) return;

    // Owner (full clearance) searches
    const result = await secureSearchService.execute({
      query: 'protocolo de kinesioterapia',
      authContext: {
        tenantId,
        userId: 'usr_owner',
        roles: ['Owner'],
        allowedVisibilityScopes: [
          VisibilityScope.ALL_STAFF,
          VisibilityScope.CLINICAL_STAFF,
          VisibilityScope.MANAGEMENT,
        ],
      },
      topK: 20,
    });

    // docA_DeletedId was marked deletedAt = new Date()
    const hasDeletedChunk = result.chunks.some((c) => c.documentId === docA_DeletedId);
    expect(hasDeletedChunk).toBe(false);
  });
});
