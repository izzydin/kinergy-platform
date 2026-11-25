import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpen, FolderOpen } from 'lucide-react';
import { cn } from '../../../../shared/lib/utils';
import { IntelligencePageContainer } from '../../components/intelligence-page-container';
import { KnowledgeOverviewView } from '../components/knowledge-overview-view';
import { KnowledgeLibraryView } from '../components/knowledge-library-view';
import { DocumentUploadModal } from '../components/document-upload-modal';

/**
 * Knowledge Center Main Route Entry Point.
 * Supports switching between Overview (Resumen) and Document Library (Biblioteca),
 * as well as opening the Secure Document Upload modal.
 */
export const KnowledgePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentView = searchParams.get('view');
  const actionParam = searchParams.get('action');

  // Track upload modal open state (synced with ?action=upload or direct button triggers)
  const [isUploadOpen, setIsUploadOpen] = useState(actionParam === 'upload');

  useEffect(() => {
    if (actionParam === 'upload') {
      setIsUploadOpen(true);
    }
  }, [actionParam]);

  const handleOpenUpload = () => {
    setIsUploadOpen(true);
  };

  const handleCloseUpload = () => {
    setIsUploadOpen(false);
    if (searchParams.get('action') === 'upload') {
      const next = new URLSearchParams(searchParams);
      next.delete('action');
      setSearchParams(next, { replace: true });
    }
  };

  // Activate Library view if explicitly requested or if any listing filter/search param is present
  const isLibraryView =
    currentView === 'library' ||
    searchParams.has('q') ||
    searchParams.has('visibilityScope') ||
    searchParams.has('mimeType') ||
    (searchParams.has('page') && searchParams.get('page') !== '1');

  const handleNavigateToLibrary = () => {
    const next = new URLSearchParams(searchParams);
    next.set('view', 'library');
    setSearchParams(next, { replace: false });
  };

  const handleNavigateToOverview = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('view');
    next.delete('q');
    next.delete('page');
    next.delete('limit');
    next.delete('sort');
    next.delete('visibilityScope');
    next.delete('mimeType');
    next.delete('createdFrom');
    next.delete('createdTo');
    setSearchParams(next, { replace: false });
  };

  return (
    <IntelligencePageContainer testId="intelligence-knowledge-page" scrollable>
      {/* View Switcher Sub-Navigation Tabs */}
      <div
        data-testid="knowledge-view-tabs"
        className="flex items-center gap-2 border-b border-border/50 pb-px mb-5"
        role="tablist"
        aria-label="Vistas del Centro de Conocimiento"
      >
        <button
          type="button"
          role="tab"
          id="tab-knowledge-overview"
          aria-selected={!isLibraryView}
          aria-controls="panel-knowledge-overview"
          onClick={handleNavigateToOverview}
          data-testid="tab-knowledge-overview"
          className={cn(
            'flex items-center gap-2 px-3.5 py-2 text-xs md:text-sm font-semibold border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-t',
            !isLibraryView
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
          )}
        >
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          <span>Resumen</span>
        </button>

        <button
          type="button"
          role="tab"
          id="tab-knowledge-library"
          aria-selected={isLibraryView}
          aria-controls="panel-knowledge-library"
          onClick={handleNavigateToLibrary}
          data-testid="tab-knowledge-library"
          className={cn(
            'flex items-center gap-2 px-3.5 py-2 text-xs md:text-sm font-semibold border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-t',
            isLibraryView
              ? 'border-primary text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border',
          )}
        >
          <FolderOpen className="h-4 w-4" aria-hidden="true" />
          <span>Biblioteca de Documentos</span>
        </button>
      </div>

      {/* Render Active View */}
      {isLibraryView ? (
        <div id="panel-knowledge-library" role="tabpanel" aria-labelledby="tab-knowledge-library">
          <KnowledgeLibraryView
            onNavigateToOverview={handleNavigateToOverview}
            onOpenUploadModal={handleOpenUpload}
          />
        </div>
      ) : (
        <div id="panel-knowledge-overview" role="tabpanel" aria-labelledby="tab-knowledge-overview">
          <KnowledgeOverviewView
            onNavigateToLibrary={handleNavigateToLibrary}
            onOpenUploadModal={handleOpenUpload}
          />
        </div>
      )}

      {/* Secure Document Upload Modal */}
      <DocumentUploadModal isOpen={isUploadOpen} onClose={handleCloseUpload} />
    </IntelligencePageContainer>
  );
};
