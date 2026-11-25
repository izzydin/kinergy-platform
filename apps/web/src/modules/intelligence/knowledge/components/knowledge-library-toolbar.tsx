import React, { useState, useEffect } from 'react';
import { Search, X, Upload, RotateCcw, Loader2 } from 'lucide-react';
import { Button } from '@kinergy-platform/ui';
import { useOptionalAuth } from '../../../../app/providers/auth-provider';
import type { VisibilityScope } from '../types/knowledge-contract.types';

export interface KnowledgeLibraryToolbarProps {
  readonly searchTerm: string;
  readonly onSearchChange: (value: string) => void;
  readonly onSearchClear: () => void;
  readonly visibilityScope?: VisibilityScope;
  readonly onVisibilityScopeChange: (scope: VisibilityScope | undefined) => void;
  readonly mimeType?: string;
  readonly onMimeTypeChange: (mime: string | undefined) => void;
  readonly isFiltered: boolean;
  readonly onResetFilters: () => void;
  readonly onUploadClick?: () => void;
  readonly isFetching?: boolean;
  readonly isLoading?: boolean;
}

export const KnowledgeLibraryToolbar: React.FC<KnowledgeLibraryToolbarProps> = ({
  searchTerm,
  onSearchChange,
  onSearchClear,
  visibilityScope,
  onVisibilityScopeChange,
  mimeType,
  onMimeTypeChange,
  isFiltered,
  onResetFilters,
  onUploadClick,
  isFetching = false,
  isLoading = false,
}) => {
  const auth = useOptionalAuth();
  const roles = auth?.currentUser?.roles ?? [];
  const canUpload =
    roles.includes('SUPER_ADMIN') ||
    roles.includes('ADMIN') ||
    roles.includes('OWNER') ||
    roles.includes('ENERGY_MANAGER');

  // Local state for responsive instant typing before debounce settles
  const [localSearch, setLocalSearch] = useState(searchTerm);

  useEffect(() => {
    setLocalSearch(searchTerm);
  }, [searchTerm]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalSearch(val);
    onSearchChange(val);
  };

  const handleClear = () => {
    setLocalSearch('');
    onSearchClear();
  };

  return (
    <div
      data-testid="knowledge-library-toolbar"
      className="flex flex-col gap-3.5 bg-card/40 border border-border/50 rounded-xl p-4 shadow-2xs backdrop-blur-xs"
    >
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search input with debounced propagation */}
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
            <Search className="h-4 w-4" aria-hidden="true" />
          </div>
          <input
            type="search"
            data-testid="library-search-input"
            value={localSearch}
            onChange={handleInputChange}
            placeholder="Buscar por título de documento..."
            aria-label="Buscar por título de documento"
            className="w-full h-9 pl-9 pr-8 text-xs md:text-sm rounded-lg border border-input bg-card text-foreground placeholder:text-muted-foreground shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent transition-colors"
          />
          {localSearch.length > 0 && (
            <button
              type="button"
              data-testid="clear-search-button"
              onClick={handleClear}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Secondary actions: Filter selectors & Upload */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Visibility Scope Filter */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="library-visibility-filter" className="sr-only">
              Filtrar por visibilidad
            </label>
            <div className="relative">
              <select
                id="library-visibility-filter"
                data-testid="filter-visibility-scope"
                value={visibilityScope ?? ''}
                onChange={(e) =>
                  onVisibilityScopeChange(
                    e.target.value ? (e.target.value as VisibilityScope) : undefined,
                  )
                }
                className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs font-medium text-foreground shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Filtrar por visibilidad"
              >
                <option value="">Todas las visibilidades</option>
                <option value="ALL_STAFF">Personal General</option>
                <option value="CLINICAL_STAFF">Personal Clínico</option>
                <option value="MANAGEMENT">Dirección / Gestión</option>
              </select>
            </div>
          </div>

          {/* MIME / File Type Filter */}
          <div className="flex items-center gap-1.5">
            <label htmlFor="library-mime-filter" className="sr-only">
              Filtrar por formato
            </label>
            <div className="relative">
              <select
                id="library-mime-filter"
                data-testid="filter-mime-type"
                value={mimeType ?? ''}
                onChange={(e) => onMimeTypeChange(e.target.value || undefined)}
                className="h-9 rounded-lg border border-input bg-card px-2.5 text-xs font-medium text-foreground shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Filtrar por formato"
              >
                <option value="">Todos los formatos</option>
                <option value="application/pdf">PDF (.pdf)</option>
                <option value="application/vnd.openxmlformats-officedocument.wordprocessingml.document">
                  Word (.docx)
                </option>
                <option value="text/markdown">Markdown (.md)</option>
                <option value="text/plain">Texto (.txt)</option>
              </select>
            </div>
          </div>

          {/* Reset Filters button */}
          {isFiltered && (
            <Button
              variant="outline"
              size="sm"
              data-testid="reset-filters-button"
              onClick={onResetFilters}
              className="h-9 px-2.5 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Limpiar filtros</span>
            </Button>
          )}

          {/* Background refresh indicator */}
          {isFetching && !isLoading && (
            <div
              data-testid="library-refreshing-indicator"
              className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground px-2 py-1 rounded-md bg-muted/40 animate-pulse"
              role="status"
              aria-live="polite"
            >
              <Loader2 className="h-3 w-3 animate-spin text-primary" />
              <span>Actualizando...</span>
            </div>
          )}

          {/* Upload Button */}
          {canUpload && onUploadClick && (
            <Button
              size="sm"
              data-testid="library-upload-button"
              onClick={onUploadClick}
              className="h-9 px-3 gap-1.5 text-xs font-semibold shadow-xs"
            >
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Subir Documento</span>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
