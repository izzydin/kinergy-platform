import { RetrievalProvenance } from '../value-objects/retrieval-provenance.vo';

describe('RetrievalProvenance Value Object', () => {
  it('should create a valid RetrievalProvenance with complete provenance metadata', () => {
    const prov = RetrievalProvenance.create({
      documentTitle: 'Clinical Shoulder Rehab',
      documentVersionNumber: 2,
      originalFileName: 'shoulder-rehab.pdf',
      mimeType: 'application/pdf',
      chunkSequence: 4,
      chunkId: 'chk_123',
      documentId: 'doc_456',
      documentVersionId: 'ver_789',
      sourceLocator: 'documents/2026/shoulder-rehab.pdf',
      pageNumber: 3,
      startChar: 1050,
      endChar: 1800,
      headingPath: ['Introduction', 'Post-Op Protocol'],
      sectionHierarchy: ['Introduction', 'Post-Op Protocol'],
      language: 'en',
    });

    expect(prov.documentTitle).toBe('Clinical Shoulder Rehab');
    expect(prov.documentVersionNumber).toBe(2);
    expect(prov.originalFileName).toBe('shoulder-rehab.pdf');
    expect(prov.mimeType).toBe('application/pdf');
    expect(prov.chunkSequence).toBe(4);
    expect(prov.chunkId).toBe('chk_123');
    expect(prov.documentId).toBe('doc_456');
    expect(prov.documentVersionId).toBe('ver_789');
    expect(prov.sourceLocator).toBe('documents/2026/shoulder-rehab.pdf');
    expect(prov.pageNumber).toBe(3);
    expect(prov.startChar).toBe(1050);
    expect(prov.endChar).toBe(1800);
    expect(prov.sectionHierarchy).toEqual(['Introduction', 'Post-Op Protocol']);
    expect(prov.headingPath).toEqual(['Introduction', 'Post-Op Protocol']);
    expect(prov.language).toBe('en');
  });

  it('should safely handle missing optional metadata without inventing page numbers or locators', () => {
    const prov = RetrievalProvenance.create({
      documentTitle: 'Quick Notes',
      documentVersionNumber: 1,
      originalFileName: 'notes.txt',
      mimeType: 'text/plain',
      chunkSequence: 0,
    });

    expect(prov.documentTitle).toBe('Quick Notes');
    expect(prov.documentVersionNumber).toBe(1);
    expect(prov.originalFileName).toBe('notes.txt');
    expect(prov.mimeType).toBe('text/plain');
    expect(prov.chunkSequence).toBe(0);
    expect(prov.chunkId).toBeUndefined();
    expect(prov.documentId).toBeUndefined();
    expect(prov.documentVersionId).toBeUndefined();
    expect(prov.sourceLocator).toBeUndefined();
    expect(prov.pageNumber).toBeUndefined(); // NEVER fabricated
    expect(prov.sectionHierarchy).toBeUndefined();
    expect(prov.startChar).toBeUndefined();
    expect(prov.endChar).toBeUndefined();
    expect(prov.language).toBe('es'); // Default language
  });

  it('should ignore non-positive or non-finite page numbers', () => {
    const prov = RetrievalProvenance.create({
      documentTitle: 'Test Doc',
      documentVersionNumber: 1,
      originalFileName: 'test.pdf',
      mimeType: 'application/pdf',
      chunkSequence: 1,
      pageNumber: 0, // Invalid, should become undefined
    });

    expect(prov.pageNumber).toBeUndefined();
  });

  it('should enforce immutability on provenance instance and hierarchy array', () => {
    const prov = RetrievalProvenance.create({
      documentTitle: 'Test Doc',
      documentVersionNumber: 1,
      originalFileName: 'test.pdf',
      mimeType: 'application/pdf',
      chunkSequence: 0,
      headingPath: ['Section 1', 'Sub 1'],
    });

    expect(Object.isFrozen(prov)).toBe(true);
    expect(Object.isFrozen(prov.headingPath)).toBe(true);
    expect(Object.isFrozen(prov.sectionHierarchy)).toBe(true);
  });
});
