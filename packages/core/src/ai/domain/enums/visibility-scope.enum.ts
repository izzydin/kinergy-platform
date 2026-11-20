/**
 * Visibility access scopes for Knowledge Documents.
 * Aligns with ADR-AI-006 pre-retrieval access control model.
 */
export enum VisibilityScope {
  ALL_STAFF = 'ALL_STAFF',
  CLINICAL_STAFF = 'CLINICAL_STAFF',
  MANAGEMENT = 'MANAGEMENT',
}
