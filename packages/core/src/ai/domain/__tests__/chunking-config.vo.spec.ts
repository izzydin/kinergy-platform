import { ChunkingConfig } from '../value-objects/chunking-config.vo';
import { ChunkId } from '../value-objects/chunk-id.vo';
import { DocumentValidationException } from '../exceptions/knowledge-document.exceptions';

describe('ChunkingConfig Value Object', () => {
  describe('Default configuration', () => {
    it('should create default configuration matching architectural requirements', () => {
      const config = ChunkingConfig.default();

      expect(config.targetChunkTokens).toBe(450);
      expect(config.minimumChunkTokens).toBe(400);
      expect(config.maximumChunkTokens).toBe(500);
      expect(config.overlapTokens).toBe(60);
      expect(config.strategy).toBe('structure-aware');
      expect(config.version).toBe('1.0.0');
      expect(Object.isFrozen(config)).toBe(true);
    });

    it('should create default configuration when empty object is passed', () => {
      const config = ChunkingConfig.create({});

      expect(config.targetChunkTokens).toBe(450);
      expect(config.minimumChunkTokens).toBe(400);
      expect(config.maximumChunkTokens).toBe(500);
      expect(config.overlapTokens).toBe(60);
      expect(config.strategy).toBe('structure-aware');
    });
  });

  describe('Custom configuration', () => {
    it('should accept valid custom parameters within bounds', () => {
      const config = ChunkingConfig.create({
        targetChunkTokens: 300,
        minimumChunkTokens: 250,
        maximumChunkTokens: 350,
        overlapTokens: 40,
        strategy: 'hierarchical',
        version: '2.0.0',
      });

      expect(config.targetChunkTokens).toBe(300);
      expect(config.minimumChunkTokens).toBe(250);
      expect(config.maximumChunkTokens).toBe(350);
      expect(config.overlapTokens).toBe(40);
      expect(config.strategy).toBe('hierarchical');
      expect(config.version).toBe('2.0.0');
    });

    it('should allow zero overlap', () => {
      const config = ChunkingConfig.create({
        overlapTokens: 0,
      });

      expect(config.overlapTokens).toBe(0);
    });
  });

  describe('Invariants & Validation', () => {
    it('should reject non-positive minimumChunkTokens', () => {
      expect(() =>
        ChunkingConfig.create({
          minimumChunkTokens: 0,
        }),
      ).toThrow(DocumentValidationException);

      expect(() =>
        ChunkingConfig.create({
          minimumChunkTokens: -50,
        }),
      ).toThrow(DocumentValidationException);
    });

    it('should reject non-positive maximumChunkTokens', () => {
      expect(() =>
        ChunkingConfig.create({
          maximumChunkTokens: 0,
        }),
      ).toThrow(DocumentValidationException);
    });

    it('should reject minimumChunkTokens greater than maximumChunkTokens', () => {
      expect(() =>
        ChunkingConfig.create({
          minimumChunkTokens: 600,
          maximumChunkTokens: 500,
          targetChunkTokens: 550,
        }),
      ).toThrow(DocumentValidationException);
    });

    it('should reject targetChunkTokens less than minimumChunkTokens', () => {
      expect(() =>
        ChunkingConfig.create({
          minimumChunkTokens: 400,
          maximumChunkTokens: 500,
          targetChunkTokens: 350,
        }),
      ).toThrow(DocumentValidationException);
    });

    it('should reject targetChunkTokens greater than maximumChunkTokens', () => {
      expect(() =>
        ChunkingConfig.create({
          minimumChunkTokens: 400,
          maximumChunkTokens: 500,
          targetChunkTokens: 550,
        }),
      ).toThrow(DocumentValidationException);
    });

    it('should reject negative overlapTokens', () => {
      expect(() =>
        ChunkingConfig.create({
          overlapTokens: -10,
        }),
      ).toThrow(DocumentValidationException);
    });

    it('should reject overlapTokens greater than or equal to minimumChunkTokens', () => {
      expect(() =>
        ChunkingConfig.create({
          minimumChunkTokens: 400,
          overlapTokens: 400,
        }),
      ).toThrow(DocumentValidationException);

      expect(() =>
        ChunkingConfig.create({
          minimumChunkTokens: 400,
          overlapTokens: 450,
        }),
      ).toThrow(DocumentValidationException);
    });

    it('should reject empty strategy', () => {
      expect(() =>
        ChunkingConfig.create({
          strategy: '   ',
        }),
      ).toThrow(DocumentValidationException);
    });

    it('should reject empty version', () => {
      expect(() =>
        ChunkingConfig.create({
          version: '',
        }),
      ).toThrow(DocumentValidationException);
    });
  });

  describe('Equality', () => {
    it('should return true for identical configurations', () => {
      const configA = ChunkingConfig.default();
      const configB = ChunkingConfig.create({});

      expect(configA.equals(configB)).toBe(true);
    });

    it('should return false for different configurations', () => {
      const configA = ChunkingConfig.default();
      const configB = ChunkingConfig.create({ overlapTokens: 30 });

      expect(configA.equals(configB)).toBe(false);
      expect(configA.equals(null)).toBe(false);
    });
  });
});

describe('ChunkId Deterministic Generation', () => {
  const docId = 'doc-clinic-789';
  const verId = 'ver-2026-v1';
  const content = 'Protocolo de rehabilitación articular para pacientes post-quirúrgicos.';

  it('should generate a valid RFC 4122 UUID compliant ChunkId', () => {
    const chunkId = ChunkId.createDeterministic(docId, verId, 0, content, '1.0.0');

    expect(chunkId).toBeInstanceOf(ChunkId);
    expect(chunkId.value).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('should be 100% deterministic across repeated invocations', () => {
    const chunkId1 = ChunkId.createDeterministic(docId, verId, 0, content, '1.0.0');
    const chunkId2 = ChunkId.createDeterministic(docId, verId, 0, content, '1.0.0');

    expect(chunkId1.value).toBe(chunkId2.value);
    expect(chunkId1.equals(chunkId2)).toBe(true);
  });

  it('should produce different IDs for different sequence numbers', () => {
    const chunkIdSeq0 = ChunkId.createDeterministic(docId, verId, 0, content);
    const chunkIdSeq1 = ChunkId.createDeterministic(docId, verId, 1, content);

    expect(chunkIdSeq0.value).not.toBe(chunkIdSeq1.value);
  });

  it('should produce different IDs for different content', () => {
    const chunkIdA = ChunkId.createDeterministic(docId, verId, 0, 'Contenido A');
    const chunkIdB = ChunkId.createDeterministic(docId, verId, 0, 'Contenido B');

    expect(chunkIdA.value).not.toBe(chunkIdB.value);
  });

  it('should produce different IDs for different document versions', () => {
    const chunkIdV1 = ChunkId.createDeterministic(docId, 'ver-1', 0, content);
    const chunkIdV2 = ChunkId.createDeterministic(docId, 'ver-2', 0, content);

    expect(chunkIdV1.value).not.toBe(chunkIdV2.value);
  });

  it('should reject invalid arguments', () => {
    expect(() => ChunkId.createDeterministic('', verId, 0, content)).toThrow(
      DocumentValidationException,
    );
    expect(() => ChunkId.createDeterministic(docId, '', 0, content)).toThrow(
      DocumentValidationException,
    );
    expect(() => ChunkId.createDeterministic(docId, verId, -1, content)).toThrow(
      DocumentValidationException,
    );
    expect(() => ChunkId.createDeterministic(docId, verId, 0, '   ')).toThrow(
      DocumentValidationException,
    );
  });
});
