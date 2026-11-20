import { IndexGeneration } from '../../domain/models/index-generation.aggregate';

export const INDEX_GENERATION_REPOSITORY_PORT = Symbol('IIndexGenerationRepositoryPort');

/**
 * Outbound Port defining index generation persistence and lifecycle transitions.
 * Pure domain contract isolated from Prisma or SQL specifics.
 */
export interface IIndexGenerationRepositoryPort {
  /**
   * Finds an index generation by its unique identifier.
   */
  findById(id: string): Promise<IndexGeneration | null>;

  /**
   * Finds the currently ACTIVE index generation for a given tenant.
   * By invariant, at most one generation can be ACTIVE per tenant.
   */
  findActiveByTenantId(tenantId: string): Promise<IndexGeneration | null>;

  /**
   * Returns the highest generation number for a tenant to increment for the next generation.
   */
  findLatestGenerationNumber(tenantId: string): Promise<number>;

  /**
   * Lists all index generations for a tenant ordered by generation number descending.
   */
  listByTenantId(tenantId: string): Promise<IndexGeneration[]>;

  /**
   * Saves or updates an IndexGeneration aggregate, enforcing optimistic locking.
   */
  save(generation: IndexGeneration): Promise<void>;

  /**
   * Atomically activates a generation and retires the previously active generation for the tenant.
   */
  promoteGeneration(generationId: string, tenantId: string): Promise<void>;
}
