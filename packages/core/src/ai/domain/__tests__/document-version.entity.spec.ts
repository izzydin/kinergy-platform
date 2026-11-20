import { DocumentVersion } from '../models/document-version.entity';
import { DocumentChecksum } from '../value-objects/document-checksum.vo';
import { DocumentValidationException } from '../exceptions/knowledge-document.exceptions';
import { DocumentFormat } from '../enums/document-format.enum';

describe('DocumentVersion Entity', () => {
  const validChecksum = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

  it('should instantiate an immutable DocumentVersion with valid properties', () => {
    const version = DocumentVersion.create({
      documentId: 'doc_1',
      versionNumber: 1,
      originalFileName: 'handbook.pdf',
      mimeType: DocumentFormat.PDF,
      fileSize: 1048576,
      checksum: validChecksum,
      storageKey: 'tenants/t1/knowledge_base/2026/11/handbook.pdf',
      uploadedBy: 'user_admin',
    });

    expect(version.id).toBeDefined();
    expect(version.documentId).toBe('doc_1');
    expect(version.versionNumber).toBe(1);
    expect(version.originalFileName).toBe('handbook.pdf');
    expect(version.mimeType).toBe(DocumentFormat.PDF);
    expect(version.fileSize).toBe(1048576);
    expect(version.checksum).toBe(validChecksum);
    expect(version.storageKey).toBe('tenants/t1/knowledge_base/2026/11/handbook.pdf');
    expect(version.language).toBe('es'); // default
    expect(version.uploadedBy).toBe('user_admin');
    expect(version.createdAt).toBeInstanceOf(Date);
  });

  it('should enforce object immutability (frozen)', () => {
    const version = DocumentVersion.create({
      documentId: 'doc_1',
      versionNumber: 1,
      originalFileName: 'rules.docx',
      mimeType: DocumentFormat.DOCX,
      fileSize: 2048,
      checksum: validChecksum,
      storageKey: 'tenants/t1/knowledge_base/2026/11/rules.docx',
      uploadedBy: 'user_1',
    });

    expect(Object.isFrozen(version)).toBe(true);
    expect(() => {
      // @ts-expect-error mutating readonly property
      version.originalFileName = 'mutated.docx';
    }).toThrow();
  });

  it('should support all approved formats: PDF, DOCX, Markdown, Text', () => {
    const formats: string[] = [
      DocumentFormat.PDF,
      DocumentFormat.DOCX,
      DocumentFormat.MARKDOWN,
      DocumentFormat.TXT,
      'text/x-markdown',
    ];

    for (let i = 0; i < formats.length; i++) {
      const mime = formats[i];
      if (!mime) continue;
      const v = DocumentVersion.create({
        documentId: 'doc_1',
        versionNumber: i + 1,
        originalFileName: `file_${i}`,
        mimeType: mime,
        fileSize: 100,
        checksum: validChecksum,
        storageKey: `key_${i}`,
        uploadedBy: 'user_1',
      });
      expect(v.versionNumber).toBe(i + 1);
    }
  });

  it('should reject unsupported MIME types', () => {
    expect(() =>
      DocumentVersion.create({
        documentId: 'doc_1',
        versionNumber: 1,
        originalFileName: 'script.exe',
        mimeType: 'application/x-msdownload',
        fileSize: 100,
        checksum: validChecksum,
        storageKey: 'key_exe',
        uploadedBy: 'user_1',
      }),
    ).toThrow(DocumentValidationException);
  });

  it('should reject non-positive file sizes', () => {
    expect(() =>
      DocumentVersion.create({
        documentId: 'doc_1',
        versionNumber: 1,
        originalFileName: 'empty.pdf',
        mimeType: DocumentFormat.PDF,
        fileSize: 0,
        checksum: validChecksum,
        storageKey: 'key_empty',
        uploadedBy: 'user_1',
      }),
    ).toThrow(DocumentValidationException);

    expect(() =>
      DocumentVersion.create({
        documentId: 'doc_1',
        versionNumber: 1,
        originalFileName: 'negative.pdf',
        mimeType: DocumentFormat.PDF,
        fileSize: -50,
        checksum: validChecksum,
        storageKey: 'key_neg',
        uploadedBy: 'user_1',
      }),
    ).toThrow(DocumentValidationException);
  });

  it('should accept DocumentChecksum instance or raw valid string', () => {
    const vo = DocumentChecksum.create(validChecksum);
    const v1 = DocumentVersion.create({
      documentId: 'doc_1',
      versionNumber: 1,
      originalFileName: 'test.pdf',
      mimeType: DocumentFormat.PDF,
      fileSize: 100,
      checksum: vo,
      storageKey: 'key_vo',
      uploadedBy: 'user_1',
    });
    expect(v1.checksum).toBe(validChecksum);
  });
});
