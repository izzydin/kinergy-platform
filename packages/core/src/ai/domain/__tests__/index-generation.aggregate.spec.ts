import { IndexGeneration } from '../models/index-generation.aggregate';
import { EmbeddingProfile } from '../value-objects/embedding-profile.vo';
import { IndexGenerationStatus } from '../enums/index-generation-status.enum';
import { InvalidIndexGenerationTransitionException } from '../exceptions/vector-indexing.exceptions';

describe('IndexGeneration Aggregate Root', () => {
  const profile = EmbeddingProfile.createBgeM3Default();
  const tenantId = 'tenant-kinergy-01';

  it('should initialize in DRAFT status with version 1 and emit created event', () => {
    const generation = IndexGeneration.create({
      tenantId,
      generationNumber: 1,
      profile,
      targetChunkCount: 100,
    });

    expect(generation.status).toBe(IndexGenerationStatus.DRAFT);
    expect(generation.version).toBe(1);
    expect(generation.tenantId).toBe(tenantId);
    expect(generation.generationNumber).toBe(1);
    expect(generation.targetChunkCount).toBe(100);
    expect(generation.indexedChunkCount).toBe(0);
    expect(generation.failedChunkCount).toBe(0);
    expect(generation.isTerminal).toBe(false);
    expect(generation.isActive).toBe(false);

    const events = generation.getUncommittedEvents();
    expect(events.length).toBe(1);
    expect(events[0]?.eventType).toBe('ai.index_generation.created');
  });

  it('should transition through full lifecycle: DRAFT -> BUILDING -> VALIDATING -> ACTIVE -> RETIRED', () => {
    const generation = IndexGeneration.create({
      tenantId,
      generationNumber: 1,
      profile,
    });

    // 1. DRAFT -> BUILDING
    generation.startBuilding();
    expect(generation.status).toBe(IndexGenerationStatus.BUILDING);
    expect(generation.startedAt).toBeInstanceOf(Date);
    expect(generation.version).toBe(2);

    // Record indexing progress
    generation.recordProgress(50, 0);
    expect(generation.indexedChunkCount).toBe(50);
    expect(generation.version).toBe(3);

    // 2. BUILDING -> VALIDATING
    generation.startValidation();
    expect(generation.status).toBe(IndexGenerationStatus.VALIDATING);
    expect(generation.validatedAt).toBeInstanceOf(Date);
    expect(generation.version).toBe(4);

    // 3. VALIDATING -> ACTIVE
    generation.activate();
    expect(generation.status).toBe(IndexGenerationStatus.ACTIVE);
    expect(generation.isActive).toBe(true);
    expect(generation.activatedAt).toBeInstanceOf(Date);
    expect(generation.version).toBe(5);

    // 4. ACTIVE -> RETIRED
    generation.retire('idxgen_next_gen');
    expect(generation.status).toBe(IndexGenerationStatus.RETIRED);
    expect(generation.isTerminal).toBe(true);
    expect(generation.retiredAt).toBeInstanceOf(Date);
    expect(generation.version).toBe(6);

    // Events verification
    const events = generation.getUncommittedEvents();
    expect(events.length).toBe(5); // created, building, validating, activated, retired
    generation.clearEvents();
    expect(generation.getUncommittedEvents().length).toBe(0);
  });

  it('should support rollback from RETIRED to ACTIVE', () => {
    const generation = IndexGeneration.create({
      tenantId,
      generationNumber: 1,
      profile,
    });
    generation.startBuilding();
    generation.recordProgress(10);
    generation.startValidation();
    generation.activate();
    generation.retire('gen-2');
    expect(generation.status).toBe(IndexGenerationStatus.RETIRED);

    generation.rollback();
    expect(generation.status).toBe(IndexGenerationStatus.ACTIVE);
    expect(generation.version).toBe(7);
  });

  it('should prevent invalid transition: DRAFT directly to ACTIVE', () => {
    const generation = IndexGeneration.create({
      tenantId,
      generationNumber: 1,
      profile,
    });

    expect(() => generation.activate()).toThrow(InvalidIndexGenerationTransitionException);
  });

  it('should prevent activating a generation with 0 indexed chunks', () => {
    const generation = IndexGeneration.create({
      tenantId,
      generationNumber: 1,
      profile,
    });

    generation.startBuilding();
    // No chunks indexed!
    expect(() => generation.startValidation()).toThrow(InvalidIndexGenerationTransitionException);
  });

  it('should handle failure from BUILDING state and transition to terminal FAILED status', () => {
    const generation = IndexGeneration.create({
      tenantId,
      generationNumber: 1,
      profile,
    });

    generation.startBuilding();
    generation.fail('MODEL_UNAVAILABLE', 'Ollama connection timeout after 30s');

    expect(generation.status).toBe(IndexGenerationStatus.FAILED);
    expect(generation.isTerminal).toBe(true);
    expect(generation.errorCode).toBe('MODEL_UNAVAILABLE');
    expect(generation.failureReason).toContain('Ollama connection timeout');
    expect(generation.failedAt).toBeInstanceOf(Date);

    // Terminal state cannot transition further
    expect(() => generation.startBuilding()).toThrow(InvalidIndexGenerationTransitionException);
  });

  it('should handle cancellation and transition to terminal CANCELLED status', () => {
    const generation = IndexGeneration.create({
      tenantId,
      generationNumber: 1,
      profile,
    });

    generation.cancel('User requested re-indexing abort');

    expect(generation.status).toBe(IndexGenerationStatus.CANCELLED);
    expect(generation.isTerminal).toBe(true);
    expect(generation.cancellationReason).toBe('User requested re-indexing abort');
    expect(generation.cancelledAt).toBeInstanceOf(Date);
  });
});
