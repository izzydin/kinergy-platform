import { Prisma, PrismaClient } from '@prisma/client';
import { IKnowledgeChunkRepositoryPort } from '../../../../ports/outbound/knowledge-chunk-repository.port';
import { DocumentChunk } from '../../../../domain/models/document-chunk.entity';
import { ChunkId } from '../../../../domain/value-objects/chunk-id.vo';
import { ChunkProvenance } from '../../../../domain/value-objects/chunk-provenance.vo';
import {
  DocumentNotFoundException,
  UnauthorizedDocumentAccessException,
} from '../../../../domain/exceptions/knowledge-document.exceptions';

/**
 * PostgreSQL and Prisma implementation of IKnowledgeChunkRepositoryPort.
 * Enforces strict tenant isolation, immutable version binding, and transactional chunk replacement.
 */
export class PrismaKnowledgeChunkRepository implements IKnowledgeChunkRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  public async saveChunks(
    tenantId: string,
    documentId: string,
    versionId: string,
    chunks: readonly DocumentChunk[],
  ): Promise<void> {
    const cleanTenantId = tenantId.trim();
    const cleanDocId = documentId.trim();
    const cleanVersionId = versionId.trim();

    await this.prisma.$transaction(async (tx) => {
      // 1. Verify document exists and belongs to the given tenant
      const doc = await tx.knowledgeDocument.findUnique({
        where: { id: cleanDocId },
        select: { tenantId: true, deletedAt: true },
      });

      if (!doc || doc.deletedAt !== null) {
        throw new DocumentNotFoundException(
          `Document '${cleanDocId}' does not exist or was deleted.`,
        );
      }

      if (doc.tenantId !== cleanTenantId) {
        throw new UnauthorizedDocumentAccessException(
          `Cross-tenant document chunk persistence forbidden. Document '${cleanDocId}' belongs to '${doc.tenantId}'.`,
        );
      }

      // 2. Verify version exists and belongs to the document
      const ver = await tx.documentVersion.findUnique({
        where: { id: cleanVersionId },
        select: { documentId: true },
      });

      if (!ver || ver.documentId !== cleanDocId) {
        throw new DocumentNotFoundException(
          `DocumentVersion '${cleanVersionId}' does not exist for document '${cleanDocId}'.`,
        );
      }

      // 3. Atomically replace any existing chunks for this version (Idempotent reprocessing)
      await tx.knowledgeChunk.deleteMany({
        where: { documentVersionId: cleanVersionId },
      });

      // 4. Bulk insert new chunks
      if (chunks.length > 0) {
        await tx.knowledgeChunk.createMany({
          data: chunks.map((c) => ({
            id: c.id.value,
            tenantId: cleanTenantId,
            documentId: cleanDocId,
            documentVersionId: cleanVersionId,
            sequence: c.sequence,
            content: c.content,
            tokenCount: c.tokenCount,
            language: c.language,
            provenance: {
              documentId: c.provenance.documentId,
              documentVersionId: c.provenance.documentVersionId,
              chunkIndex: c.provenance.chunkIndex,
              pageNumber: c.provenance.pageNumber,
              sectionHierarchy: c.provenance.sectionHierarchy,
              sourceBlockIds: c.provenance.sourceBlockIds,
              startOffset: c.provenance.startOffset,
              endOffset: c.provenance.endOffset,
              startLine: c.provenance.startLine,
              endLine: c.provenance.endLine,
              language: c.provenance.language,
              checksum: c.provenance.checksum,
              configurationVersion: c.provenance.configurationVersion,
            },
            metadata: (c.metadata as Prisma.InputJsonValue) ?? {},
            checksum: c.checksum,
            createdAt: c.createdAt,
          })),
        });
      }
    });
  }

  public async findByVersionId(tenantId: string, versionId: string): Promise<DocumentChunk[]> {
    const records = await this.prisma.knowledgeChunk.findMany({
      where: {
        tenantId: tenantId.trim(),
        documentVersionId: versionId.trim(),
      },
      orderBy: { sequence: 'asc' },
    });

    return records.map((r) => {
      const provRaw = r.provenance as Record<string, unknown>;

      const provenance = ChunkProvenance.create({
        documentId: r.documentId,
        documentVersionId: r.documentVersionId,
        chunkIndex: r.sequence,
        pageNumber: typeof provRaw['pageNumber'] === 'number' ? provRaw['pageNumber'] : null,
        sectionHierarchy: Array.isArray(provRaw['sectionHierarchy'])
          ? (provRaw['sectionHierarchy'] as string[])
          : [],
        sourceBlockIds: Array.isArray(provRaw['sourceBlockIds'])
          ? (provRaw['sourceBlockIds'] as string[])
          : [],
        startOffset: typeof provRaw['startOffset'] === 'number' ? provRaw['startOffset'] : null,
        endOffset: typeof provRaw['endOffset'] === 'number' ? provRaw['endOffset'] : null,
        startLine: typeof provRaw['startLine'] === 'number' ? provRaw['startLine'] : null,
        endLine: typeof provRaw['endLine'] === 'number' ? provRaw['endLine'] : null,
        language: r.language,
        checksum: r.checksum,
        configurationVersion:
          typeof provRaw['configurationVersion'] === 'string'
            ? provRaw['configurationVersion']
            : '1.0.0',
      });

      return DocumentChunk.create({
        id: ChunkId.create(r.id),
        documentId: r.documentId,
        documentVersionId: r.documentVersionId,
        sequence: r.sequence,
        content: r.content,
        tokenCount: r.tokenCount,
        language: r.language,
        provenance,
        metadata: (r.metadata as Record<string, unknown>) ?? {},
        createdAt: r.createdAt,
      });
    });
  }

  public async deleteByVersionId(tenantId: string, versionId: string): Promise<number> {
    const result = await this.prisma.knowledgeChunk.deleteMany({
      where: {
        tenantId: tenantId.trim(),
        documentVersionId: versionId.trim(),
      },
    });

    return result.count;
  }

  public async countByVersionId(tenantId: string, versionId: string): Promise<number> {
    return await this.prisma.knowledgeChunk.count({
      where: {
        tenantId: tenantId.trim(),
        documentVersionId: versionId.trim(),
      },
    });
  }
}
