import {
  KnowledgeDocument as PrismaKnowledgeDocument,
  DocumentVersion as PrismaDocumentVersion,
  VisibilityScope as PrismaVisibilityScope,
} from '@prisma/client';
import { KnowledgeDocument } from '../../../../domain/models/knowledge-document.aggregate';
import { DocumentVersion } from '../../../../domain/models/document-version.entity';
import { DocumentId } from '../../../../domain/value-objects/document-id.vo';
import { VisibilityScope } from '../../../../domain/enums/visibility-scope.enum';

export type PrismaKnowledgeDocumentWithVersions = PrismaKnowledgeDocument & {
  versions?: PrismaDocumentVersion[];
};

export class PrismaKnowledgeDocumentMapper {
  public static toDomain(raw: PrismaKnowledgeDocumentWithVersions): KnowledgeDocument {
    const versions = (raw.versions || []).map((v) =>
      DocumentVersion.create({
        id: v.id,
        documentId: v.documentId,
        versionNumber: v.versionNumber,
        originalFileName: v.originalFileName,
        mimeType: v.mimeType,
        fileSize: v.fileSize,
        checksum: v.checksum,
        storageKey: v.storageKey,
        language: v.language,
        uploadedBy: v.uploadedBy,
        createdAt: v.createdAt,
      }),
    );

    return KnowledgeDocument.reconstitute({
      id: DocumentId.create(raw.id),
      title: raw.title,
      description: raw.description,
      tenantId: raw.tenantId,
      uploadedBy: raw.uploadedBy,
      visibilityScope: raw.visibilityScope as unknown as VisibilityScope,
      currentVersionId: raw.currentVersionId,
      version: raw.version,
      versions,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
      deletedAt: raw.deletedAt,
    });
  }

  public static toPrismaVisibilityScope(scope: VisibilityScope): PrismaVisibilityScope {
    return scope as unknown as PrismaVisibilityScope;
  }
}
