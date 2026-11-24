import React from 'react';
import { BookOpen, FileUp, FolderTree } from 'lucide-react';
import { IntelligencePageContainer } from '../../components/intelligence-page-container';
import { IntelligencePageHeader } from '../../components/intelligence-page-header';
import { IntelligenceEmptyState } from '../../components/intelligence-empty-state';

/**
 * Foundational Page Component for the Knowledge Center.
 * Serves as the mounting shell for upcoming Milestone AI-09.2 (Document Library & Upload).
 */
export const KnowledgePage: React.FC = () => {
  return (
    <IntelligencePageContainer testId="intelligence-knowledge-page" scrollable>
      <IntelligencePageHeader
        title="Base de Conocimiento & Documentación"
        description="Administra documentos institucionales, manuales de procedimiento e instrucciones clínicas indexadas en el motor vectorial para consultas asistidas."
        icon={BookOpen}
      />

      <IntelligenceEmptyState
        title="Documentos y Guías Clínicas"
        description="Los documentos cargados se dividen en fragmentos semánticos e indexan en pgvector para recuperación RAG."
        icon={BookOpen}
        action={
          <div className="flex flex-wrap items-center justify-center gap-3">
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
              <FileUp className="h-3.5 w-3.5 text-primary" />
              <span>Formatos: PDF, DOCX, MD, TXT (hasta 10 MB)</span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground">
              <FolderTree className="h-3.5 w-3.5 text-primary" />
              <span>Indexación HNSW pgvector</span>
            </div>
          </div>
        }
      />
    </IntelligencePageContainer>
  );
};
