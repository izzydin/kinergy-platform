import { MockLLMAdapter } from '../mocks/mock-llm.adapter';
import { MockEmbeddingAdapter } from '../mocks/mock-embedding.adapter';
import {
  runLLMProviderContractTests,
  runEmbeddingProviderContractTests,
} from './provider-contract.suite';

describe('Reusable AI Provider Contract Verification', () => {
  runLLMProviderContractTests('MockLLMAdapter', () => new MockLLMAdapter());
  runEmbeddingProviderContractTests('MockEmbeddingAdapter', () => new MockEmbeddingAdapter());
});
