import { Prisma, PrismaClient } from '@prisma/client';
import { KnowledgeDocument } from '../../../../domain/models/knowledge-document.aggregate';
import { DocumentId } from '../../../../domain/value-objects/document-id.vo';
import {
  FindDocumentsFilter,
  IKnowledgeDocumentRepositoryPort,
} from '../../../../ports/outbound/knowledge-document-repository.port';
import { PrismaKnowledgeDocumentMapper } from '../mappers/prisma-knowledge-document.mapper';
import {
  DocumentNotFoundException,
  DocumentVersionConflictException,
  DuplicateDocumentVersionException,
  UnauthorizedDocumentAccessException,
} from '../../../../domain/exceptions/knowledge-document.exceptions';
import { AiDomainException } from '../../../../domain/exceptions/ai-provider.exceptions';

/**
 * PostgreSQL and Prisma implementation of IKnowledgeDocumentRepositoryPort.
 * Enforces strict tenant isolation, transactional atomicity, and version immutability.
 */
export class PrismaKnowledgeDocumentRepository implements IKnowledgeDocumentRepositoryPort {
  constructor(private readonly prisma: PrismaClient) {}

  public async save(document: KnowledgeDocument): Promise<KnowledgeDocument> {
    const docIdStr = document.id.value;
    const tenantId = document.tenantId;

    try {
      await this.prisma.$transaction(async (tx) => {
        // 1. Verify tenant consistency if document already exists
        const existing = await tx.knowledgeDocument.findUnique({
          where: { id: docIdStr },
          select: { tenantId: true },
        });

        if (existing && existing.tenantId !== tenantId) {
          throw new UnauthorizedDocumentAccessException(
            `Cross-tenant document mutation forbidden. Document '${docIdStr}' belongs to '${existing.tenantId}'.`,
          );
        }

        // 2. Upsert parent document aggregate root
        await tx.knowledgeDocument.upsert({
          where: { id: docIdStr },
          create: {
            id: docIdStr,
            tenantId,
            title: document.title,
            description: document.description,
            uploadedBy: document.uploadedBy,
            visibilityScope: document.visibilityScope,
            currentVersionId: document.currentVersionId,
            version: document.version,
            createdAt: document.createdAt,
            updatedAt: document.updatedAt,
            deletedAt: document.deletedAt,
          },
          update: {
            title: document.title,
            description: document.description,
            visibilityScope: document.visibilityScope,
            currentVersionId: document.currentVersionId,
            version: document.version,
            updatedAt: document.updatedAt,
            deletedAt: document.deletedAt,
          },
        });

        // 3. Atomically persist all versions (versions are strictly immutable)
        for (const v of document.getAllVersions()) {
          await tx.documentVersion.upsert({
            where: {
              unique_document_version_number: {
                documentId: docIdStr,
                versionNumber: v.versionNumber,
              },
            },
            create: {
              id: v.id,
              documentId: docIdStr,
              versionNumber: v.versionNumber,
              originalFileName: v.originalFileName,
              mimeType: v.mimeType,
              fileSize: v.fileSize,
              checksum: v.checksum,
              storageKey: v.storageKey,
              language: v.language,
              uploadedBy: v.uploadedBy,
              createdAt: v.createdAt,
            },
            update: {}, // Invariant: historical version properties are permanently immutable
          });
        }
      });

      return document;
    } catch (error: unknown) {
      if (error instanceof AiDomainException) {
        throw error;
      }

      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = String(error.meta?.target || '');
        if (target.includes('checksum')) {
          throw new DuplicateDocumentVersionException(
            'Checksum already registered in this document.',
            0,
          );
        }
        if (target.includes('version_number')) {
          throw new DocumentVersionConflictException(
            `Version conflict detected for document '${docIdStr}'.`,
          );
        }
      }

      throw error;
    }
  }

  public async findById(
    tenantId: string,
    id: DocumentId | string,
  ): Promise<KnowledgeDocument | null> {
    const idStr = typeof id === 'string' ? id.trim() : id.value;
    if (!idStr || !tenantId) return null;

    const raw = await this.prisma.knowledgeDocument.findFirst({
      where: {
        id: idStr,
        tenantId: tenantId.trim(),
      },
      include: {
        versions: {
          orderBy: { versionNumber: 'asc' },
        },
      },
    });

    if (!raw) return null;
    return PrismaKnowledgeDocumentMapper.toDomain(raw);
  }

  public async findByChecksum(
    tenantId: string,
    checksum: string,
  ): Promise<KnowledgeDocument | null> {
    if (!checksum || !tenantId) return null;

    const versionRecord = await this.prisma.documentVersion.findFirst({
      where: {
        checksum: checksum.trim().toLowerCase(),
        document: {
          tenantId: tenantId.trim(),
          deletedAt: null,
        },
      },
      include: {
        document: {
          include: {
            versions: {
              orderBy: { versionNumber: 'asc' },
            },
          },
        },
      },
    });

    if (!versionRecord?.document) return null;
    return PrismaKnowledgeDocumentMapper.toDomain(versionRecord.document);
  }

  private buildWhereClause(
    tenantId: string,
    filter?: FindDocumentsFilter,
  ): Prisma.KnowledgeDocumentWhereInput {
    const where: Prisma.KnowledgeDocumentWhereInput = {
      tenantId: tenantId.trim(),
    };

    if (!filter?.includeDeleted) {
      where.deletedAt = null;
    }

    if (filter?.visibilityScopes && filter.visibilityScopes.length > 0) {
      if (filter.visibilityScope) {
        where.visibilityScope = filter.visibilityScopes.includes(filter.visibilityScope)
          ? filter.visibilityScope
          : { in: [] };
      } else {
        where.visibilityScope = { in: filter.visibilityScopes };
      }
    } else if (filter?.visibilityScope) {
      where.visibilityScope = filter.visibilityScope;
    }

    if (filter?.search) {
      where.title = {
        contains: filter.search.trim(),
        mode: 'insensitive',
      };
    }

    if (filter?.uploadedBy) {
      where.uploadedBy = filter.uploadedBy.trim();
    }

    if (filter?.mimeType) {
      where.versions = {
        some: {
          mimeType: filter.mimeType.trim(),
        },
      };
    }

    if (filter?.createdFrom || filter?.createdTo) {
      where.createdAt = {};
      if (filter.createdFrom) {
        where.createdAt.gte = filter.createdFrom;
      }
      if (filter.createdTo) {
        where.createdAt.lte = filter.createdTo;
      }
    }

    return where;
  }

  public async findAll(
    tenantId: string,
    filter?: FindDocumentsFilter,
  ): Promise<KnowledgeDocument[]> {
    if (!tenantId) return [];

    const where = this.buildWhereClause(tenantId, filter);
    const orderField = filter?.orderBy ?? 'createdAt';
    const orderDirection = filter?.orderDirection ?? 'desc';

    const records = await this.prisma.knowledgeDocument.findMany({
      where,
      include: {
        versions: {
          orderBy: { versionNumber: 'asc' },
        },
      },
      orderBy: [{ [orderField]: orderDirection }, { id: 'asc' }],
      take: filter?.limit,
      skip: filter?.offset,
    });

    return records.map((r) => PrismaKnowledgeDocumentMapper.toDomain(r));
  }

  public async count(tenantId: string, filter?: FindDocumentsFilter): Promise<number> {
    if (!tenantId) return 0;
    const where = this.buildWhereClause(tenantId, filter);
    return this.prisma.knowledgeDocument.count({ where });
  }

  public async softDelete(
    tenantId: string,
    id: DocumentId | string,
    deletedBy: string,
  ): Promise<void> {
    const doc = await this.findById(tenantId, id);
    if (!doc) {
      const idStr = typeof id === 'string' ? id : id.value;
      throw new DocumentNotFoundException(idStr);
    }

    doc.softDelete(deletedBy);
    await this.save(doc);
  }
}
