import { PrismaClient } from '@prisma/client';
import { PrismaLexicalRetrievalRepository } from '../repositories/prisma-lexical-retrieval.repository';
import { PrismaKnowledgeDocumentRepository } from '../repositories/prisma-knowledge-document.repository';
import { PrismaKnowledgeChunkRepository } from '../repositories/prisma-knowledge-chunk.repository';
import { KnowledgeDocument } from '../../../../domain/models/knowledge-document.aggregate';
import { DocumentChunk } from '../../../../domain/models/document-chunk.entity';
import { ChunkId } from '../../../../domain/value-objects/chunk-id.vo';
import { ChunkProvenance } from '../../../../domain/value-objects/chunk-provenance.vo';
import { RetrievalQuery } from '../../../../domain/value-objects/retrieval-query.vo';
import { RetrievalCriteria } from '../../../../domain/value-objects/retrieval-criteria.vo';
import { VisibilityScope } from '../../../../domain/enums/visibility-scope.enum';

describe('AI-07.1 — PostgreSQL Full-Text Search Integration (Prisma + GIN Indexing)', () => {
  let prisma: PrismaClient;
  let lexicalRepo: PrismaLexicalRetrievalRepository;
  let docRepo: PrismaKnowledgeDocumentRepository;
  let chunkRepo: PrismaKnowledgeChunkRepository;
  let isDbAvailable = false;

  const tenantA = `tenant_lex_a_${Date.now()}`;
  const tenantB = `tenant_lex_b_${Date.now()}`;
  const checksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  beforeAll(async () => {
    prisma = new PrismaClient();
    try {
      await prisma.$connect();
      await prisma.$queryRawUnsafe('SELECT 1');
      isDbAvailable = true;

      lexicalRepo = new PrismaLexicalRetrievalRepository(prisma);
      docRepo = new PrismaKnowledgeDocumentRepository(prisma);
      chunkRepo = new PrismaKnowledgeChunkRepository(prisma);
    } catch {
      isDbAvailable = false;
    }
  });

  afterAll(async () => {
    if (isDbAvailable && prisma) {
      for (const tenant of [tenantA, tenantB]) {
        await prisma.knowledgeDocument
          .deleteMany({
            where: { tenantId: tenant },
          })
          .catch(() => {});
      }
      await prisma.$disconnect();
    }
  });

  it('1. should verify GIN full-text index exists on knowledge_chunks.tsv', async () => {
    if (!isDbAvailable) return;

    const indexRows = await prisma.$queryRawUnsafe<Array<{ indexname: string; indexdef: string }>>(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'knowledge_chunks' AND indexname = 'idx_knowledge_chunks_tsv';`,
    );
    expect(indexRows.length).toBe(1);
    expect(indexRows[0]?.indexdef).toContain('USING gin (tsv)');
  });

  it('2. should enforce multi-tenant isolation: Tenant A query never returns Tenant B chunk', async () => {
    if (!isDbAvailable) return;

    const sharedSecretKeyword = 'SupercalifragilisticoSecreto';

    // Seed Document for Tenant A
    const docA = KnowledgeDocument.create({
      tenantId: tenantA,
      title: 'Documento Confidencial Clinico A',
      uploadedBy: 'usr_admin_a',
      visibilityScope: VisibilityScope.ALL_STAFF,
    });
    const verA = docA.addVersion({
      checksum,
      storageKey: 's3://bucket/doc_a.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      originalFileName: 'doc_a.pdf',
      uploadedBy: 'usr_admin_a',
    });
    await docRepo.save(docA);

    const chunkIdA = ChunkId.createDeterministic(docA.id.value, verA.id, 0, 'Contenido Tenant A');
    const chunkA = DocumentChunk.create({
      id: chunkIdA,
      documentId: docA.id.value,
      documentVersionId: verA.id,
      sequence: 0,
      content: `Este contenido pertenece exclusivamente a Tenant A con palabra clave ${sharedSecretKeyword}.`,
      tokenCount: 15,
      language: 'es',
      provenance: ChunkProvenance.create({
        documentId: docA.id.value,
        documentVersionId: verA.id,
        chunkIndex: 0,
        pageNumber: 1,
        checksum,
        configurationVersion: '1.0.0',
      }),
    });
    await chunkRepo.saveChunks(tenantA, docA.id.value, verA.id, [chunkA]);

    // Seed Document for Tenant B with identical keyword
    const docB = KnowledgeDocument.create({
      tenantId: tenantB,
      title: 'Documento Confidencial B',
      uploadedBy: 'usr_admin_b',
      visibilityScope: VisibilityScope.ALL_STAFF,
    });
    const verB = docB.addVersion({
      checksum,
      storageKey: 's3://bucket/doc_b.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      originalFileName: 'doc_b.pdf',
      uploadedBy: 'usr_admin_b',
    });
    await docRepo.save(docB);

    const chunkIdB = ChunkId.createDeterministic(docB.id.value, verB.id, 0, 'Contenido Tenant B');
    const chunkB = DocumentChunk.create({
      id: chunkIdB,
      documentId: docB.id.value,
      documentVersionId: verB.id,
      sequence: 0,
      content: `Este contenido es privado de Tenant B con palabra clave ${sharedSecretKeyword}.`,
      tokenCount: 15,
      language: 'es',
      provenance: ChunkProvenance.create({
        documentId: docB.id.value,
        documentVersionId: verB.id,
        chunkIndex: 0,
        pageNumber: 1,
        checksum,
        configurationVersion: '1.0.0',
      }),
    });
    await chunkRepo.saveChunks(tenantB, docB.id.value, verB.id, [chunkB]);

    // Query under Tenant A
    const criteriaA = RetrievalCriteria.create({ tenantId: tenantA });
    const queryA = RetrievalQuery.create({ query: sharedSecretKeyword, criteria: criteriaA });
    const resultsA = await lexicalRepo.search(queryA);

    expect(resultsA.length).toBe(1);
    expect(resultsA[0]?.documentId).toBe(docA.id.value);
    expect(resultsA[0]?.content).toContain('Tenant A');
    expect(resultsA.some((r) => r.documentId === docB.id.value)).toBe(false);

    // Query under Tenant B
    const criteriaB = RetrievalCriteria.create({ tenantId: tenantB });
    const queryB = RetrievalQuery.create({ query: sharedSecretKeyword, criteria: criteriaB });
    const resultsB = await lexicalRepo.search(queryB);

    expect(resultsB.length).toBe(1);
    expect(resultsB[0]?.documentId).toBe(docB.id.value);
    expect(resultsB[0]?.content).toContain('Tenant B');
    expect(resultsB.some((r) => r.documentId === docA.id.value)).toBe(false);
  });

  it('3. should perform exact keyword match and multi-term queries with Spanish stemming', async () => {
    if (!isDbAvailable) return;

    const doc = KnowledgeDocument.create({
      tenantId: tenantA,
      title: 'Protocolo de Rehabilitación LCA',
      uploadedBy: 'usr_staff_a',
      visibilityScope: VisibilityScope.ALL_STAFF,
    });
    const ver = doc.addVersion({
      checksum,
      storageKey: 's3://bucket/lca.pdf',
      fileSize: 2048,
      mimeType: 'application/pdf',
      originalFileName: 'lca.pdf',
      uploadedBy: 'usr_staff_a',
    });
    await docRepo.save(doc);

    // Note: chunk has plural 'desgarros' and verb 'rehabilitar'
    const chunkId = ChunkId.createDeterministic(doc.id.value, ver.id, 1, 'desgarros isquiosurales');
    const chunk = DocumentChunk.create({
      id: chunkId,
      documentId: doc.id.value,
      documentVersionId: ver.id,
      sequence: 1,
      content:
        'Tratamiento de desgarros musculares en isquiosurales mediante ejercicios excéntricos progresivos.',
      tokenCount: 14,
      language: 'es',
      provenance: ChunkProvenance.create({
        documentId: doc.id.value,
        documentVersionId: ver.id,
        chunkIndex: 1,
        pageNumber: 2,
        checksum,
        configurationVersion: '1.0.0',
      }),
      metadata: { section: 'Fase de Readaptación' },
    });
    await chunkRepo.saveChunks(tenantA, doc.id.value, ver.id, [chunk]);

    // Query using singular 'desgarro isquiosural' -> stems to same roots ('desgarr', 'isquiosural')
    const criteria = RetrievalCriteria.create({ tenantId: tenantA });
    const query = RetrievalQuery.create({
      query: 'desgarro isquiosural',
      criteria,
      topK: 5,
    });

    const results = await lexicalRepo.search(query);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0]?.content).toContain('desgarros musculares en isquiosurales');
    expect(results[0]?.similarity.value).toBeGreaterThan(0.0);
    expect(results[0]?.provenance.sectionHierarchy).toContain('Fase de Readaptación');
  });

  it('4. should support phrase queries and boolean negation via websearch syntax', async () => {
    if (!isDbAvailable) return;

    const doc = KnowledgeDocument.create({
      tenantId: tenantA,
      title: 'Fisioterapia y Traumatologia de Hombro',
      uploadedBy: 'usr_staff_a',
      visibilityScope: VisibilityScope.ALL_STAFF,
    });
    const ver = doc.addVersion({
      checksum,
      storageKey: 's3://bucket/hombro.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      originalFileName: 'hombro.pdf',
      uploadedBy: 'usr_staff_a',
    });
    await docRepo.save(doc);

    const chunk1 = DocumentChunk.create({
      id: ChunkId.createDeterministic(doc.id.value, ver.id, 1, 'manguito rotador'),
      documentId: doc.id.value,
      documentVersionId: ver.id,
      sequence: 1,
      content: 'Fortalecimiento de manguito rotador con bandas elásticas en decúbito lateral.',
      tokenCount: 12,
      language: 'es',
      provenance: ChunkProvenance.create({
        documentId: doc.id.value,
        documentVersionId: ver.id,
        chunkIndex: 1,
        pageNumber: 1,
        checksum,
        configurationVersion: '1.0.0',
      }),
    });

    const chunk2 = DocumentChunk.create({
      id: ChunkId.createDeterministic(doc.id.value, ver.id, 2, 'codo muñeca'),
      documentId: doc.id.value,
      documentVersionId: ver.id,
      sequence: 2,
      content: 'Movilización pasiva de codo y muñeca en pacientes postquirúrgicos.',
      tokenCount: 10,
      language: 'es',
      provenance: ChunkProvenance.create({
        documentId: doc.id.value,
        documentVersionId: ver.id,
        chunkIndex: 2,
        pageNumber: 1,
        checksum,
        configurationVersion: '1.0.0',
      }),
    });
    await chunkRepo.saveChunks(tenantA, doc.id.value, ver.id, [chunk1, chunk2]);

    const criteria = RetrievalCriteria.create({ tenantId: tenantA });

    // Phrase search with quotation marks: "manguito rotador"
    const phraseQuery = RetrievalQuery.create({
      query: '"manguito rotador"',
      criteria,
    });
    const phraseResults = await lexicalRepo.search(phraseQuery);
    expect(phraseResults.length).toBe(1);
    expect(phraseResults[0]?.content).toContain('manguito rotador');

    // Negation search: postquirurgicos -muñeca (should return 0 because chunk2 contains muñeca)
    const negQuery = RetrievalQuery.create({
      query: 'postquirurgicos -muñeca',
      criteria,
    });
    const negResults = await lexicalRepo.search(negQuery);
    expect(negResults.length).toBe(0);
  });

  it('5. should support English language documents and English stemming', async () => {
    if (!isDbAvailable) return;

    const doc = KnowledgeDocument.create({
      tenantId: tenantA,
      title: 'Clinical Practice Guideline for Knee Injuries',
      uploadedBy: 'usr_staff_a',
      visibilityScope: VisibilityScope.ALL_STAFF,
    });
    const ver = doc.addVersion({
      checksum,
      storageKey: 's3://bucket/knee.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      originalFileName: 'knee.pdf',
      uploadedBy: 'usr_staff_a',
    });
    await docRepo.save(doc);

    const chunkEn = DocumentChunk.create({
      id: ChunkId.createDeterministic(doc.id.value, ver.id, 1, 'meniscus tears'),
      documentId: doc.id.value,
      documentVersionId: ver.id,
      sequence: 1,
      content:
        'Patients recovering from acute meniscus tears should prioritize non-weight bearing exercises.',
      tokenCount: 14,
      language: 'en',
      provenance: ChunkProvenance.create({
        documentId: doc.id.value,
        documentVersionId: ver.id,
        chunkIndex: 1,
        pageNumber: 1,
        checksum,
        configurationVersion: '1.0.0',
      }),
    });
    await chunkRepo.saveChunks(tenantA, doc.id.value, ver.id, [chunkEn]);

    const criteria = RetrievalCriteria.create({ tenantId: tenantA });
    // English query with singular 'tear' and 'exercise'
    const queryEn = RetrievalQuery.create({
      query: 'meniscus tear exercise',
      criteria,
    });
    const resultsEn = await lexicalRepo.search(queryEn);
    expect(resultsEn.length).toBe(1);
    expect(resultsEn[0]?.content).toContain('meniscus tears');
  });

  it('6. should enforce weighted ranking: Title matches (Weight A) rank higher than body matches (Weight C)', async () => {
    if (!isDbAvailable) return;

    const uniqueTerm = 'HidroterapiaSubacuatica';

    // Doc 1: Has term in Title (Weight A)
    const docTitle = KnowledgeDocument.create({
      tenantId: tenantA,
      title: `Manual de ${uniqueTerm}`,
      uploadedBy: 'usr_staff_a',
      visibilityScope: VisibilityScope.ALL_STAFF,
    });
    const verTitle = docTitle.addVersion({
      checksum,
      storageKey: 's3://bucket/title.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      originalFileName: 'title.pdf',
      uploadedBy: 'usr_staff_a',
    });
    await docRepo.save(docTitle);

    const chunkTitle = DocumentChunk.create({
      id: ChunkId.createDeterministic(docTitle.id.value, verTitle.id, 1, 'piscina agua'),
      documentId: docTitle.id.value,
      documentVersionId: verTitle.id,
      sequence: 1,
      content: 'Instrucciones generales de piscina y temperatura del agua.',
      tokenCount: 10,
      language: 'es',
      provenance: ChunkProvenance.create({
        documentId: docTitle.id.value,
        documentVersionId: verTitle.id,
        chunkIndex: 1,
        pageNumber: 1,
        checksum,
        configurationVersion: '1.0.0',
      }),
    });

    // Doc 2: Has term in Body only (Weight C)
    const docBody = KnowledgeDocument.create({
      tenantId: tenantA,
      title: 'Reglamento General de Instalaciones',
      uploadedBy: 'usr_staff_a',
      visibilityScope: VisibilityScope.ALL_STAFF,
    });
    const verBody = docBody.addVersion({
      checksum,
      storageKey: 's3://bucket/body.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      originalFileName: 'body.pdf',
      uploadedBy: 'usr_staff_a',
    });
    await docRepo.save(docBody);

    const chunkBody = DocumentChunk.create({
      id: ChunkId.createDeterministic(docBody.id.value, verBody.id, 1, 'pileta climatizada'),
      documentId: docBody.id.value,
      documentVersionId: verBody.id,
      sequence: 1,
      content: `Normas de uso para la sesión de ${uniqueTerm} en pileta climatizada.`,
      tokenCount: 12,
      language: 'es',
      provenance: ChunkProvenance.create({
        documentId: docBody.id.value,
        documentVersionId: verBody.id,
        chunkIndex: 1,
        pageNumber: 1,
        checksum,
        configurationVersion: '1.0.0',
      }),
    });

    await chunkRepo.saveChunks(tenantA, docTitle.id.value, verTitle.id, [chunkTitle]);
    await chunkRepo.saveChunks(tenantA, docBody.id.value, verBody.id, [chunkBody]);

    const criteria = RetrievalCriteria.create({ tenantId: tenantA });
    const query = RetrievalQuery.create({ query: uniqueTerm, criteria, topK: 5 });
    const results = await lexicalRepo.search(query);

    expect(results.length).toBe(2);
    // Title match has higher ts_rank due to Weight 'A'
    expect(results[0]?.documentId).toBe(docTitle.id.value);
    expect(results[1]?.documentId).toBe(docBody.id.value);
    expect(results[0]?.similarity.value).toBeGreaterThan(results[1]?.similarity.value ?? 0);
  });

  it('7. should enforce visibility scope authorization', async () => {
    if (!isDbAvailable) return;

    const confidentialKeyword = 'BalanceFinancieroConfidencial2026';

    const docManagement = KnowledgeDocument.create({
      tenantId: tenantA,
      title: 'Reporte Financiero',
      uploadedBy: 'usr_ceo',
      visibilityScope: VisibilityScope.MANAGEMENT,
    });
    const verManagement = docManagement.addVersion({
      checksum,
      storageKey: 's3://bucket/fin.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      originalFileName: 'fin.pdf',
      uploadedBy: 'usr_ceo',
    });
    await docRepo.save(docManagement);

    const chunkManagement = DocumentChunk.create({
      id: ChunkId.createDeterministic(docManagement.id.value, verManagement.id, 1, 'ingresos'),
      documentId: docManagement.id.value,
      documentVersionId: verManagement.id,
      sequence: 1,
      content: `Detalle reservado de ingresos y ${confidentialKeyword}.`,
      tokenCount: 8,
      language: 'es',
      provenance: ChunkProvenance.create({
        documentId: docManagement.id.value,
        documentVersionId: verManagement.id,
        chunkIndex: 1,
        pageNumber: 1,
        checksum,
        configurationVersion: '1.0.0',
      }),
    });
    await chunkRepo.saveChunks(tenantA, docManagement.id.value, verManagement.id, [
      chunkManagement,
    ]);

    // Query with only ALL_STAFF scope -> must NOT return MANAGEMENT document
    const criteriaStaff = RetrievalCriteria.create({
      tenantId: tenantA,
      allowedVisibilityScopes: [VisibilityScope.ALL_STAFF],
    });
    const queryStaff = RetrievalQuery.create({
      query: confidentialKeyword,
      criteria: criteriaStaff,
    });
    const resultsStaff = await lexicalRepo.search(queryStaff);
    expect(resultsStaff.length).toBe(0);

    // Query with MANAGEMENT scope -> returns document
    const criteriaMgmt = RetrievalCriteria.create({
      tenantId: tenantA,
      allowedVisibilityScopes: [VisibilityScope.MANAGEMENT],
    });
    const queryMgmt = RetrievalQuery.create({ query: confidentialKeyword, criteria: criteriaMgmt });
    const resultsMgmt = await lexicalRepo.search(queryMgmt);
    expect(resultsMgmt.length).toBe(1);
    expect(resultsMgmt[0]?.documentId).toBe(docManagement.id.value);
  });

  it('8. should exclude soft-deleted documents from search results and match counts', async () => {
    if (!isDbAvailable) return;

    const softDeleteTerm = 'PoliticaVacacionesCaduca';

    const docDeleted = KnowledgeDocument.create({
      tenantId: tenantA,
      title: 'Politica de Vacaciones Antigua',
      uploadedBy: 'usr_hr',
      visibilityScope: VisibilityScope.ALL_STAFF,
    });
    const verDeleted = docDeleted.addVersion({
      checksum,
      storageKey: 's3://bucket/vac.pdf',
      fileSize: 1024,
      mimeType: 'application/pdf',
      originalFileName: 'vac.pdf',
      uploadedBy: 'usr_hr',
    });
    await docRepo.save(docDeleted);

    const chunk = DocumentChunk.create({
      id: ChunkId.createDeterministic(docDeleted.id.value, verDeleted.id, 1, 'derogadas'),
      documentId: docDeleted.id.value,
      documentVersionId: verDeleted.id,
      sequence: 1,
      content: `Condiciones de ${softDeleteTerm} derogadas.`,
      tokenCount: 7,
      language: 'es',
      provenance: ChunkProvenance.create({
        documentId: docDeleted.id.value,
        documentVersionId: verDeleted.id,
        chunkIndex: 1,
        pageNumber: 1,
        checksum,
        configurationVersion: '1.0.0',
      }),
    });
    await chunkRepo.saveChunks(tenantA, docDeleted.id.value, verDeleted.id, [chunk]);

    // Verify it is found before deletion
    const criteria = RetrievalCriteria.create({ tenantId: tenantA });
    const query = RetrievalQuery.create({ query: softDeleteTerm, criteria });
    expect(await lexicalRepo.countMatches(query)).toBe(1);

    // Soft delete the document
    await prisma.knowledgeDocument.update({
      where: { id: docDeleted.id.value },
      data: { deletedAt: new Date() },
    });

    // Verify it is excluded after soft delete
    const resultsAfter = await lexicalRepo.search(query);
    expect(resultsAfter.length).toBe(0);
    expect(await lexicalRepo.countMatches(query)).toBe(0);
  });

  it('9. should handle empty and malformed input gracefully without database errors', async () => {
    if (!isDbAvailable) return;

    const criteria = RetrievalCriteria.create({ tenantId: tenantA });

    // Stop words only
    const stopwordQuery = RetrievalQuery.create({ query: 'de la que y el en', criteria });
    const stopwordResults = await lexicalRepo.search(stopwordQuery);
    expect(stopwordResults).toEqual([]);
    expect(await lexicalRepo.countMatches(stopwordQuery)).toBe(0);

    // Punctuation only
    const punctQuery = RetrievalQuery.create({ query: '??? !!! -- ***', criteria });
    const punctResults = await lexicalRepo.search(punctQuery);
    expect(punctResults).toEqual([]);
    expect(await lexicalRepo.countMatches(punctQuery)).toBe(0);
  });

  it('10. should resist SQL injection attempts and treat syntax as literal query terms', async () => {
    if (!isDbAvailable) return;

    const criteria = RetrievalCriteria.create({ tenantId: tenantA });
    const injectionQuery = RetrievalQuery.create({
      query: `'; DROP TABLE "knowledge_chunks"; SELECT * FROM "knowledge_documents" WHERE '1'='1`,
      criteria,
    });

    // Must execute safely through parameterization without crashing or executing injection
    const results = await lexicalRepo.search(injectionQuery);
    expect(Array.isArray(results)).toBe(true);

    // Verify table was NOT dropped
    const count = await prisma.knowledgeChunk.count();
    expect(count).toBeGreaterThan(0);
  });
});
