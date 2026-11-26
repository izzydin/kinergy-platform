import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Textarea,
  Select,
} from '@kinergy-platform/ui';
import { Edit3, Loader2 } from 'lucide-react';
import { useUpdateDocumentMetadata } from '../hooks/use-knowledge-mutations';
import type { KnowledgeDocumentItem, VisibilityScope } from '../types/knowledge-contract.types';

export interface DocumentEditMetadataModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly document: KnowledgeDocumentItem;
}

export const DocumentEditMetadataModal: React.FC<DocumentEditMetadataModalProps> = ({
  isOpen,
  onClose,
  document,
}) => {
  const [title, setTitle] = useState(document.title);
  const [description, setDescription] = useState(document.description || '');
  const [visibilityScope, setVisibilityScope] = useState<VisibilityScope>(document.visibilityScope);

  const updateMutation = useUpdateDocumentMetadata();

  useEffect(() => {
    if (isOpen) {
      setTitle(document.title);
      setDescription(document.description || '');
      setVisibilityScope(document.visibilityScope);
    }
  }, [isOpen, document]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || updateMutation.isPending) return;

    await updateMutation.mutateAsync({
      documentId: document.id,
      body: {
        title: title.trim(),
        description: description.trim() || undefined,
        visibilityScope,
      },
    });

    onClose();
  };

  const isSaving = updateMutation.isPending;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isSaving && onClose()}>
      <DialogContent
        data-testid="document-edit-metadata-modal"
        aria-describedby="edit-metadata-description"
        className="sm:max-w-lg"
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <DialogHeader className="gap-1">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Edit3 className="h-4 w-4" aria-hidden="true" />
              </div>
              <DialogTitle className="text-base font-bold text-foreground">
                Editar Metadatos del Documento
              </DialogTitle>
            </div>
            <DialogDescription
              id="edit-metadata-description"
              className="text-xs text-muted-foreground"
            >
              Modifica los atributos descriptivos y el alcance de visibilidad. El contenido y
              checksums del archivo no se verán alterados.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3.5 py-1">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-doc-title" className="text-xs font-semibold text-foreground">
                Título del documento *
              </label>
              <Input
                id="edit-doc-title"
                data-testid="edit-document-title-input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isSaving}
                placeholder="Título del documento..."
                className="h-9 text-xs"
                required
                aria-required="true"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="edit-doc-description"
                className="text-xs font-semibold text-foreground"
              >
                Descripción (opcional)
              </label>
              <Textarea
                id="edit-doc-description"
                data-testid="edit-document-description-input"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={isSaving}
                placeholder="Breve resumen del contenido para contextualización..."
                className="text-xs min-h-[70px]"
                rows={3}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="edit-doc-scope" className="text-xs font-semibold text-foreground">
                Alcance de visibilidad
              </label>
              <Select
                id="edit-doc-scope"
                data-testid="edit-document-scope-select"
                value={visibilityScope}
                onChange={(e) => setVisibilityScope(e.target.value as VisibilityScope)}
                disabled={isSaving}
                className="h-9 text-xs"
              >
                <option value="ALL_STAFF">Toda la organización (General)</option>
                <option value="CLINICAL_STAFF">Personal Clínico</option>
                <option value="MANAGEMENT">Dirección / Gestión</option>
              </Select>
            </div>
          </div>

          <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSaving}
              data-testid="cancel-edit-metadata-button"
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="default"
              disabled={!title.trim() || isSaving}
              data-testid="save-edit-metadata-button"
              className="text-xs gap-1.5"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  <span>Guardando...</span>
                </>
              ) : (
                <span>Guardar cambios</span>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
