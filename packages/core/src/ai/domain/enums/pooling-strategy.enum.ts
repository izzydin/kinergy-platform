/**
 * Token pooling strategy used to produce dense document vector representation.
 * For BGE-M3 dense embeddings, the CLS token representation is utilized.
 */
export enum PoolingStrategy {
  CLS = 'CLS',
  MEAN = 'MEAN',
  LAST_TOKEN = 'LAST_TOKEN',
}
