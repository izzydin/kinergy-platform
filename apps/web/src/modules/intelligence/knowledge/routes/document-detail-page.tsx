import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText, Layers } from 'lucide-react';
import { IntelligencePageContainer } from '../../components/intelligence-page-container';
import { IntelligencePageHeader } from '../../components/intelligence-page-header';

/**
 * Foundational Page Component for Document Detail & Version Inspection.
 */
export const DocumentDetailPage: React.FC = () => {
  const { documentId } = useParams<{ documentId: string }>();

  return (
    <IntelligencePageContainer testId="intelligence-document-detail-page" scrollable>
      <div className="mb-1">
        <Link
          to="/intelligence/knowledge"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver a la Biblioteca
        </Link>
      </div>

      <IntelligencePageHeader
        title="Detalle de Documento"
        description={`ID: ${documentId || 'No especificado'}`}
        icon={FileText}
      />

      <div className="flex-1 rounded-xl border border-dashed border-border/70 bg-card/30 p-8 flex items-center justify-center text-center min-h-[250px]">
        <div className="max-w-sm">
          <Layers className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-foreground mb-1">
            Historial de Versiones e Ingesta
          </h3>
          <p className="text-xs text-muted-foreground">
            Inspección de versiones, fragmentos semánticos y descargas disponible en Milestone
            AI-09.2.
          </p>
        </div>
      </div>
    </IntelligencePageContainer>
  );
};
