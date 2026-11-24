/**
 * Types specific to the Knowledge Center document management interface.
 */

export type KnowledgeViewState = 'listing' | 'uploading' | 'inspecting' | 'error';

export interface KnowledgeFilterCriteria {
  readonly search?: string;
  readonly visibilityScope?: string;
  readonly mimeType?: string;
  readonly page: number;
  readonly limit: number;
}

export interface DocumentUploadIntent {
  readonly file: File;
  readonly title: string;
  readonly description?: string;
  readonly visibilityScope: string;
}
