import { httpClient } from '../../../shared/api/http-client';
import type { IntelligenceHealthState } from '../types';

/**
 * Fetches the live subsystem health status of the AI engine (Ollama LLM, Embeddings, pgvector).
 */
export async function fetchAIHealth(): Promise<IntelligenceHealthState> {
  return httpClient.get<IntelligenceHealthState>('/api/v1/ai/health');
}
