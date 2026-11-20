/**
 * Type of vector embedding representation.
 * Current milestone AI-05 strictly targets DENSE vectors (BGE-M3 1,024 dims).
 */
export enum EmbeddingType {
  DENSE = 'DENSE',
  SPARSE = 'SPARSE',
  HYBRID = 'HYBRID',
}
