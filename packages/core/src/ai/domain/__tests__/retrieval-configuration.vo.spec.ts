import { RetrievalConfiguration } from '../value-objects/retrieval-configuration.vo';
import { RetrievalSearchMode } from '../enums/retrieval-search-mode.enum';
import { InvalidRetrievalConfigurationException } from '../exceptions/retrieval.exceptions';

describe('RetrievalConfiguration Value Object', () => {
  it('should create default configuration with approved baseline invariants', () => {
    const config = RetrievalConfiguration.default();

    expect(config.defaultTopK).toBe(5);
    expect(config.maxTopK).toBe(50);
    expect(config.similarityMetric).toBe('cosine');
    expect(config.searchMode).toBe(RetrievalSearchMode.SEMANTIC);
    expect(config.embeddingModel).toBe('bge-m3');
    expect(config.embeddingDimensions).toBe(1024);
    expect(config.defaultMinSimilarity).toBe(0.0);
    expect(config.queryTimeoutMs).toBe(10000);
  });

  it('should reject incompatible embedding dimensions', () => {
    expect(() =>
      RetrievalConfiguration.create({
        embeddingDimensions: 768, // Incompatible with BGE-M3
      }),
    ).toThrow(InvalidRetrievalConfigurationException);
  });

  it('should reject defaultTopK greater than maxTopK', () => {
    expect(() =>
      RetrievalConfiguration.create({
        defaultTopK: 60,
        maxTopK: 50,
      }),
    ).toThrow(InvalidRetrievalConfigurationException);
  });

  it('should reject negative or zero query timeout', () => {
    expect(() =>
      RetrievalConfiguration.create({
        queryTimeoutMs: 0,
      }),
    ).toThrow(InvalidRetrievalConfigurationException);
  });
});
