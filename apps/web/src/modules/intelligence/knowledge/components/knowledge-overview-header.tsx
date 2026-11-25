import React from 'react';
import { BookOpen, Upload, FolderOpen } from 'lucide-react';
import { Button } from '@kinergy-platform/ui';
import { useOptionalAuth } from '../../../../app/providers/auth-provider';
import { canAccessKnowledgeCenter } from '../../routes/intelligence-knowledge-guard';

export interface KnowledgeOverviewHeaderProps {
  readonly onUploadClick?: () => void;
  readonly onBrowseClick?: () => void;
}

/**
 * Standardized header banner for Knowledge Center Overview with role-gated administrative actions.
 */
export const KnowledgeOverviewHeader: React.FC<KnowledgeOverviewHeaderProps> = ({
  onUploadClick,
  onBrowseClick,
}) => {
  const auth = useOptionalAuth();
  const canManage = auth ? canAccessKnowledgeCenter(auth.currentUser, auth.hasRole) : true;

  return (
    <div
      data-testid="knowledge-overview-header"
      className="flex flex-col gap-4 border-b border-border/50 bg-card/40 p-4 md:p-6 rounded-xl border backdrop-blur-xs transition-colors"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-xs">
            <BookOpen className="h-5 w-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg md:text-xl font-bold tracking-tight text-foreground truncate">
              Base de Conocimiento & Documentación
            </h1>
            <p className="text-xs md:text-sm text-muted-foreground mt-0.5 max-w-2xl">
              Administración de guías clínicas, manuales operativos y protocolos institucionales
              indexados en el motor vectorial para consultas asistidas. Formatos aceptados: PDF,
              DOCX, MD, TXT.
            </p>
          </div>
        </div>

        {canManage && (
          <div className="flex items-center gap-2.5 shrink-0 self-start sm:self-auto">
            {onBrowseClick && (
              <Button
                variant="outline"
                size="sm"
                onClick={onBrowseClick}
                data-testid="knowledge-browse-button"
                className="gap-2 h-9 text-xs font-medium"
              >
                <FolderOpen className="h-4 w-4" aria-hidden="true" />
                <span>Explorar Biblioteca</span>
              </Button>
            )}

            {onUploadClick && (
              <Button
                variant="default"
                size="sm"
                onClick={onUploadClick}
                data-testid="knowledge-upload-button"
                className="gap-2 h-9 text-xs font-semibold shadow-xs"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                <span>Subir Documento</span>
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
