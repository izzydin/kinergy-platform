import {
  AiSourceAttributionService,
  CanonicalSourceCitation,
} from '../services/ai-source-attribution.service';
import { RAGSourceCitation } from '../../domain/value-objects/rag-source-citation.vo';

describe('AI-09.3-BE.06.06 — AiSourceAttributionService Unit Tests', () => {
  const validCitationProps: CanonicalSourceCitation = {
    documentId: 'doc_knee_protocol_01',
    documentTitle: 'Knee Rehabilitation Guidelines',
    chunkId: 'chk_eccentric_quad_01',
    pageNumber: 14,
    headingPath: ['Rehabilitation Protocols', 'Eccentric Quadriceps Loading'],
    relevanceScore: 0.942,
    sourceStrategy: 'HYBRID',
  };

  describe('validateAndSanitize', () => {
    it('1. returns empty array for null, undefined, or empty sources input', () => {
      expect(AiSourceAttributionService.validateAndSanitize(null)).toEqual([]);
      expect(AiSourceAttributionService.validateAndSanitize(undefined)).toEqual([]);
      expect(AiSourceAttributionService.validateAndSanitize([])).toEqual([]);
      expect(
        AiSourceAttributionService.validateAndSanitize('invalid' as unknown as unknown[]),
      ).toEqual([]);
    });

    it('2. preserves and cleanses a single valid source citation', () => {
      const result = AiSourceAttributionService.validateAndSanitize([validCitationProps]);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        documentId: 'doc_knee_protocol_01',
        documentTitle: 'Knee Rehabilitation Guidelines',
        chunkId: 'chk_eccentric_quad_01',
        pageNumber: 14,
        headingPath: ['Rehabilitation Protocols', 'Eccentric Quadriceps Loading'],
        relevanceScore: 0.942,
        sourceStrategy: 'HYBRID',
      });
    });

    it('3. handles RAGSourceCitation Value Objects directly', () => {
      const ragCitation = RAGSourceCitation.create({
        documentId: 'doc_002',
        documentTitle: 'Patellar Tendon Management',
        chunkId: 'chk_002',
        pageNumber: 5,
        headingPath: ['Section 1', 'Diagnosis'],
        relevanceScore: 0.88,
        sourceStrategy: 'SEMANTIC',
      });

      const result = AiSourceAttributionService.validateAndSanitize([ragCitation]);

      expect(result).toHaveLength(1);
      expect(result[0]!.documentId).toBe('doc_002');
      expect(result[0]!.chunkId).toBe('chk_002');
      expect(result[0]!.relevanceScore).toBe(0.88);
    });

    it('4. preserves multiple distinct retrieved source citations in order', () => {
      const sources = [
        validCitationProps,
        {
          documentId: 'doc_rotator_cuff_02',
          documentTitle: 'Shoulder Impingement Protocol',
          chunkId: 'chk_scapular_dyskinesis_02',
          pageNumber: 22,
          headingPath: ['Rotator Cuff Care'],
          relevanceScore: 0.815,
          sourceStrategy: 'SEMANTIC',
        },
      ];

      const result = AiSourceAttributionService.validateAndSanitize(sources);

      expect(result).toHaveLength(2);
      expect(result[0]!.chunkId).toBe('chk_eccentric_quad_01');
      expect(result[1]!.chunkId).toBe('chk_scapular_dyskinesis_02');
    });

    it('5. clamps relevance scores strictly to [0.0, 1.0] and rejects non-numeric scores', () => {
      const sources = [
        { ...validCitationProps, chunkId: 'c1', relevanceScore: 1.5 },
        { ...validCitationProps, chunkId: 'c2', relevanceScore: -0.8 },
        { ...validCitationProps, chunkId: 'c3', relevanceScore: 'invalid' as unknown as number },
        { ...validCitationProps, chunkId: 'c4', relevanceScore: NaN },
      ];

      const result = AiSourceAttributionService.validateAndSanitize(sources);

      expect(result).toHaveLength(2);
      expect(result[0]!.relevanceScore).toBe(1.0);
      expect(result[1]!.relevanceScore).toBe(0.0);
    });

    it('6. safely rejects or omits malformed references missing mandatory fields', () => {
      const malformedSources = [
        { documentTitle: 'Title', chunkId: 'chk1', relevanceScore: 0.9 }, // missing documentId
        { documentId: 'doc1', chunkId: 'chk1', relevanceScore: 0.9 }, // missing documentTitle
        { documentId: 'doc1', documentTitle: 'Title', relevanceScore: 0.9 }, // missing chunkId
        { documentId: '  ', documentTitle: 'Title', chunkId: 'chk1', relevanceScore: 0.9 }, // empty documentId
        { documentId: 'doc1', documentTitle: '   ', chunkId: 'chk1', relevanceScore: 0.9 }, // empty title
        { documentId: 'doc1', documentTitle: 'Title', chunkId: '   ', relevanceScore: 0.9 }, // empty chunkId
        null,
        undefined,
        'non-object',
      ];

      const result = AiSourceAttributionService.validateAndSanitize(malformedSources);
      expect(result).toEqual([]);
    });

    it('7. safely normalizes optional page numbers and heading paths', () => {
      const sources = [
        {
          ...validCitationProps,
          chunkId: 'chk_p1',
          pageNumber: -5, // invalid page
          headingPath: ['  ', '', 123 as unknown as string], // empty/invalid headings
        },
        {
          ...validCitationProps,
          chunkId: 'chk_p2',
          pageNumber: 3.14, // float page
          headingPath: 'not-an-array' as unknown as string[],
        },
      ];

      const result = AiSourceAttributionService.validateAndSanitize(sources);

      expect(result).toHaveLength(2);
      expect(result[0]!.pageNumber).toBeNull();
      expect(result[0]!.headingPath).toBeNull();
      expect(result[1]!.pageNumber).toBeNull();
      expect(result[1]!.headingPath).toBeNull();
    });

    it('8. deduplicates identical documentId and chunkId references, preserving highest score', () => {
      const duplicateSources = [
        {
          ...validCitationProps,
          chunkId: 'chk_shared_01',
          relevanceScore: 0.75,
        },
        {
          ...validCitationProps,
          chunkId: 'chk_shared_01',
          relevanceScore: 0.92, // higher score
        },
        {
          ...validCitationProps,
          chunkId: 'chk_shared_01',
          relevanceScore: 0.65, // lower score
        },
      ];

      const result = AiSourceAttributionService.validateAndSanitize(duplicateSources);

      expect(result).toHaveLength(1);
      expect(result[0]!.chunkId).toBe('chk_shared_01');
      expect(result[0]!.relevanceScore).toBe(0.92);
    });

    it('9. strips unsafe internal fields and file system paths', () => {
      const unsafeSource = {
        ...validCitationProps,
        storagePath: 's3://internal-bucket/medical-records/doc.pdf',
        filePath: 'C:\\Projects\\secrets\\doc.pdf',
        embedding: [0.123, -0.456, 0.789],
        token: 'secret_jwt_token',
        databaseUrl: 'postgresql://admin:pass@db:5432/kinergy',
      };

      const result = AiSourceAttributionService.validateAndSanitize([unsafeSource]);

      expect(result).toHaveLength(1);
      const raw = result[0]! as unknown as Record<string, unknown>;
      expect(raw['storagePath']).toBeUndefined();
      expect(raw['filePath']).toBeUndefined();
      expect(raw['embedding']).toBeUndefined();
      expect(raw['token']).toBeUndefined();
      expect(raw['databaseUrl']).toBeUndefined();
    });

    it('10. rejects titles containing suspicious absolute filesystem paths', () => {
      const suspiciousSources = [
        {
          ...validCitationProps,
          chunkId: 'c1',
          documentTitle: 'C:\\Users\\admin\\Confidential.pdf',
        },
        {
          ...validCitationProps,
          chunkId: 'c2',
          documentTitle: '/var/www/internal_data.txt',
        },
      ];

      const result = AiSourceAttributionService.validateAndSanitize(suspiciousSources);
      expect(result).toHaveLength(0);
    });

    it('11. enforces tenant document access isolation when allowedDocumentIds is specified', () => {
      const mixedSources = [
        {
          ...validCitationProps,
          documentId: 'doc_authorized_01',
          chunkId: 'chk_01',
        },
        {
          ...validCitationProps,
          documentId: 'doc_foreign_tenant_99',
          chunkId: 'chk_99',
        },
      ];

      const result = AiSourceAttributionService.validateAndSanitize(mixedSources, {
        allowedDocumentIds: ['doc_authorized_01'],
      });

      expect(result).toHaveLength(1);
      expect(result[0]!.documentId).toBe('doc_authorized_01');
      expect(result[0]!.chunkId).toBe('chk_01');
    });
  });

  describe('serializeForPersistence', () => {
    it('1. serializes canonical citations into clean records for PostgreSQL jsonb', () => {
      const citations = [validCitationProps];
      const serialized = AiSourceAttributionService.serializeForPersistence(citations);

      expect(serialized).toHaveLength(1);
      expect(serialized[0]).toEqual({
        documentId: 'doc_knee_protocol_01',
        documentTitle: 'Knee Rehabilitation Guidelines',
        chunkId: 'chk_eccentric_quad_01',
        pageNumber: 14,
        headingPath: ['Rehabilitation Protocols', 'Eccentric Quadriceps Loading'],
        relevanceScore: 0.942,
        sourceStrategy: 'HYBRID',
      });
    });

    it('2. returns empty array for empty or null citations', () => {
      expect(AiSourceAttributionService.serializeForPersistence([])).toEqual([]);
      expect(AiSourceAttributionService.serializeForPersistence(null)).toEqual([]);
      expect(AiSourceAttributionService.serializeForPersistence(undefined)).toEqual([]);
    });
  });

  describe('deserializeFromPersistence and mapToResponseDto', () => {
    it('1. deserializes valid persisted jsonb records from database', () => {
      const rawPersisted = [
        {
          documentId: 'doc_db_01',
          documentTitle: 'Manual Terapia Manual',
          chunkId: 'chk_db_01',
          pageNumber: 8,
          headingPath: ['Capítulo 1'],
          relevanceScore: 0.89,
          sourceStrategy: 'HYBRID',
        },
      ];

      const deserialized = AiSourceAttributionService.deserializeFromPersistence(rawPersisted);
      expect(deserialized).toHaveLength(1);
      expect(deserialized[0]!.documentId).toBe('doc_db_01');
    });

    it('2. maps to API response DTO cleanly, returning null when no citations exist', () => {
      expect(AiSourceAttributionService.mapToResponseDto(null)).toBeNull();
      expect(AiSourceAttributionService.mapToResponseDto([])).toBeNull();

      const dto = AiSourceAttributionService.mapToResponseDto([validCitationProps]);
      expect(dto).not.toBeNull();
      expect(dto).toHaveLength(1);
      expect(dto![0]!.documentId).toBe('doc_knee_protocol_01');
    });
  });
});
