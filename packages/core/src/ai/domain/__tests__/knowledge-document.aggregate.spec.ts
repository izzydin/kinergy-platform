import { KnowledgeDocument } from '../models/knowledge-document.aggregate';
import { DocumentId } from '../value-objects/document-id.vo';
import { VisibilityScope } from '../enums/visibility-scope.enum';
import { DocumentFormat } from '../enums/document-format.enum';
import {
  DocumentAlreadyDeletedException,
  DocumentValidationException,
  DuplicateDocumentVersionException,
  UnauthorizedDocumentAccessException,
} from '../exceptions/knowledge-document.exceptions';
import {
  KnowledgeDocumentCreatedEvent,
  DocumentVersionAddedEvent,
  KnowledgeDocumentUpdatedEvent,
  KnowledgeDocumentDeletedEvent,
  KnowledgeDocumentRestoredEvent,
} from '../events/document-events';

describe('KnowledgeDocument Aggregate Root', () => {
  const checksum1 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const checksum2 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
  const checksum3 = 'cb8379ac2098aa165029e3938a51da0bcecfc008fd6795f401178647f96c5b34';

  describe('Creation', () => {
    it('should create a valid KnowledgeDocument aggregate without initial version', () => {
      const doc = KnowledgeDocument.create({
        title: 'Gym Equipment Manual',
        description: 'Standard operational protocol for kinesis equipment',
        tenantId: 'tenant_gym_1',
        uploadedBy: 'staff_123',
        visibilityScope: VisibilityScope.ALL_STAFF,
      });

      expect(doc.id).toBeInstanceOf(DocumentId);
      expect(doc.title).toBe('Gym Equipment Manual');
      expect(doc.description).toBe('Standard operational protocol for kinesis equipment');
      expect(doc.tenantId).toBe('tenant_gym_1');
      expect(doc.uploadedBy).toBe('staff_123');
      expect(doc.visibilityScope).toBe(VisibilityScope.ALL_STAFF);
      expect(doc.currentVersionId).toBeNull();
      expect(doc.version).toBe(1);
      expect(doc.isDeleted()).toBe(false);
      expect(doc.deletedAt).toBeNull();
      expect(doc.createdAt).toBeInstanceOf(Date);
      expect(doc.updatedAt).toBeInstanceOf(Date);

      const events = doc.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(KnowledgeDocumentCreatedEvent);
      expect(events[0]?.aggregateId).toBe(doc.id.value);
    });

    it('should create KnowledgeDocument and add initial version atomically if provided', () => {
      const doc = KnowledgeDocument.create({
        title: 'Clinic Guidelines',
        tenantId: 'tenant_clinic',
        uploadedBy: 'therapist_01',
        initialVersion: {
          originalFileName: 'guidelines.pdf',
          mimeType: DocumentFormat.PDF,
          fileSize: 45000,
          checksum: checksum1,
          storageKey: 'tenants/tenant_clinic/knowledge_base/guidelines.pdf',
        },
      });

      expect(doc.getAllVersions()).toHaveLength(1);
      expect(doc.currentVersionId).toBeDefined();
      expect(doc.getCurrentVersion()?.versionNumber).toBe(1);
      expect(doc.getCurrentVersion()?.checksum).toBe(checksum1);
      expect(doc.version).toBe(2); // 1 base + 1 version add

      const events = doc.getUncommittedEvents();
      expect(events).toHaveLength(2);
      expect(events[0]).toBeInstanceOf(KnowledgeDocumentCreatedEvent);
      expect(events[1]).toBeInstanceOf(DocumentVersionAddedEvent);
    });

    it('should reject creation with empty title, tenantId, or uploadedBy', () => {
      expect(() =>
        KnowledgeDocument.create({
          title: '',
          tenantId: 'tenant_1',
          uploadedBy: 'user_1',
        }),
      ).toThrow(DocumentValidationException);

      expect(() =>
        KnowledgeDocument.create({
          title: 'Valid Title',
          tenantId: '   ',
          uploadedBy: 'user_1',
        }),
      ).toThrow(DocumentValidationException);

      expect(() =>
        KnowledgeDocument.create({
          title: 'Valid Title',
          tenantId: 'tenant_1',
          uploadedBy: '',
        }),
      ).toThrow(DocumentValidationException);
    });
  });

  describe('Versioning Rules', () => {
    it('should enforce sequential version numbering (v1, v2, v3)', () => {
      const doc = KnowledgeDocument.create({
        title: 'Policy Manual',
        tenantId: 't1',
        uploadedBy: 'admin',
      });

      const v1 = doc.addVersion({
        originalFileName: 'policy_v1.pdf',
        mimeType: DocumentFormat.PDF,
        fileSize: 1000,
        checksum: checksum1,
        storageKey: 'key_v1',
      });

      const v2 = doc.addVersion({
        originalFileName: 'policy_v2.pdf',
        mimeType: DocumentFormat.PDF,
        fileSize: 1200,
        checksum: checksum2,
        storageKey: 'key_v2',
      });

      const v3 = doc.addVersion({
        originalFileName: 'policy_v3.md',
        mimeType: DocumentFormat.MARKDOWN,
        fileSize: 1500,
        checksum: checksum3,
        storageKey: 'key_v3',
      });

      expect(v1.versionNumber).toBe(1);
      expect(v2.versionNumber).toBe(2);
      expect(v3.versionNumber).toBe(3);

      expect(doc.currentVersionId).toBe(v3.id);
      expect(doc.getCurrentVersion()?.id).toBe(v3.id);
      expect(doc.getAllVersions()).toHaveLength(3);
    });

    it('should reject duplicate checksum within the same document', () => {
      const doc = KnowledgeDocument.create({
        title: 'Manual',
        tenantId: 't1',
        uploadedBy: 'admin',
      });

      doc.addVersion({
        originalFileName: 'doc_v1.pdf',
        mimeType: DocumentFormat.PDF,
        fileSize: 1000,
        checksum: checksum1,
        storageKey: 'key_v1',
      });

      expect(() =>
        doc.addVersion({
          originalFileName: 'doc_v1_reupload.pdf',
          mimeType: DocumentFormat.PDF,
          fileSize: 1000,
          checksum: checksum1, // Identical checksum!
          storageKey: 'key_v1_dup',
        }),
      ).toThrow(DuplicateDocumentVersionException);
    });

    it('should retrieve versions by versionNumber or ID', () => {
      const doc = KnowledgeDocument.create({
        title: 'Manual',
        tenantId: 't1',
        uploadedBy: 'admin',
      });

      const v1 = doc.addVersion({
        originalFileName: 'v1.pdf',
        mimeType: DocumentFormat.PDF,
        fileSize: 500,
        checksum: checksum1,
        storageKey: 'key_v1',
      });

      expect(doc.getVersion(1)).toBe(v1);
      expect(doc.getVersion(99)).toBeUndefined();
      expect(doc.getVersionById(v1.id)).toBe(v1);
      expect(doc.getVersionById('non_existent')).toBeUndefined();
    });
  });

  describe('Metadata and Scope Management', () => {
    it('should update metadata and emit KnowledgeDocumentUpdatedEvent', () => {
      const doc = KnowledgeDocument.create({
        title: 'Initial Title',
        tenantId: 't1',
        uploadedBy: 'admin',
      });
      doc.clearEvents();

      doc.updateMetadata('Updated Title', 'New description');

      expect(doc.title).toBe('Updated Title');
      expect(doc.description).toBe('New description');
      expect(doc.version).toBe(2);

      const events = doc.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(KnowledgeDocumentUpdatedEvent);
    });

    it('should change visibility scope and increment version', () => {
      const doc = KnowledgeDocument.create({
        title: 'Staff Only',
        tenantId: 't1',
        uploadedBy: 'admin',
        visibilityScope: VisibilityScope.ALL_STAFF,
      });

      doc.changeVisibilityScope(VisibilityScope.MANAGEMENT);
      expect(doc.visibilityScope).toBe(VisibilityScope.MANAGEMENT);
      expect(doc.version).toBe(2);
    });
  });

  describe('Soft Deletion and Invariants', () => {
    it('should soft delete document and emit KnowledgeDocumentDeletedEvent', () => {
      const doc = KnowledgeDocument.create({
        title: 'To Delete',
        tenantId: 't1',
        uploadedBy: 'admin',
      });
      doc.clearEvents();

      doc.softDelete('manager_1');

      expect(doc.isDeleted()).toBe(true);
      expect(doc.deletedAt).toBeInstanceOf(Date);

      const events = doc.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(KnowledgeDocumentDeletedEvent);
    });

    it('should prevent operations on deleted documents', () => {
      const doc = KnowledgeDocument.create({
        title: 'To Delete',
        tenantId: 't1',
        uploadedBy: 'admin',
      });
      doc.softDelete('admin');

      expect(() => doc.softDelete('admin')).toThrow(DocumentAlreadyDeletedException);
      expect(() => doc.updateMetadata('New Title')).toThrow(DocumentAlreadyDeletedException);
      expect(() =>
        doc.addVersion({
          originalFileName: 'file.pdf',
          mimeType: DocumentFormat.PDF,
          fileSize: 100,
          checksum: checksum1,
          storageKey: 'key',
        }),
      ).toThrow(DocumentAlreadyDeletedException);
    });

    it('should restore soft-deleted document', () => {
      const doc = KnowledgeDocument.create({
        title: 'Restorable',
        tenantId: 't1',
        uploadedBy: 'admin',
      });
      doc.softDelete('admin');
      doc.clearEvents();

      doc.restore();

      expect(doc.isDeleted()).toBe(false);
      expect(doc.deletedAt).toBeNull();

      const events = doc.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0]).toBeInstanceOf(KnowledgeDocumentRestoredEvent);
    });
  });

  describe('Tenant Boundary & Ownership Enforcement', () => {
    it('should pass tenant ownership assertion for matching tenant', () => {
      const doc = KnowledgeDocument.create({
        title: 'Secure Doc',
        tenantId: 'tenant_alpha',
        uploadedBy: 'admin',
      });

      expect(() => doc.assertTenantOwnership('tenant_alpha')).not.toThrow();
    });

    it('should throw UnauthorizedDocumentAccessException for mismatched tenant', () => {
      const doc = KnowledgeDocument.create({
        title: 'Secure Doc',
        tenantId: 'tenant_alpha',
        uploadedBy: 'admin',
      });

      expect(() => doc.assertTenantOwnership('tenant_beta')).toThrow(
        UnauthorizedDocumentAccessException,
      );
      expect(() => doc.assertTenantOwnership('')).toThrow(UnauthorizedDocumentAccessException);
    });
  });
});
