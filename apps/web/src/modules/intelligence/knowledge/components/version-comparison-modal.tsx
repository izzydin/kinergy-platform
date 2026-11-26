import React, { useState, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Select,
} from '@kinergy-platform/ui';
import { GitCompare, Download, Eye, ShieldCheck, ShieldAlert } from 'lucide-react';
import { IngestionStatusBadge } from './ingestion-status-badge';
import type { DocumentVersionItem } from '../types/knowledge-contract.types';

export interface VersionComparisonModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
  readonly documentId: string;
  readonly documentTitle: string;
  readonly versions: readonly DocumentVersionItem[];
  readonly currentVersionId?: string;
  readonly initialVersionAId?: string;
  readonly initialVersionBId?: string;
  readonly onPreviewVersion?: (versionId: string) => void;
  readonly onDownloadVersion?: (version: DocumentVersionItem) => void;
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return '—';
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(isoString?: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return isoString;
  }
}

/**
 * VersionComparisonModal
 *
 * Compares two document versions side-by-side using authoritative metadata.
 * Conforms to KC.08 requirements:
 * - Compares version numbers, upload dates, uploaders, file sizes, format/mime, and SHA-256 hashes.
 * - Displays delta differences without simulating content-level diffs.
 * - Provides authorized access (preview/download) for each compared version.
 */
export const VersionComparisonModal: React.FC<VersionComparisonModalProps> = ({
  isOpen,
  onClose,
  documentTitle,
  versions,
  currentVersionId,
  initialVersionAId,
  initialVersionBId,
  onPreviewVersion,
  onDownloadVersion,
}) => {
  // Deterministic sort: descending by version number
  const sortedVersions = useMemo(() => {
    return [...versions].sort((a, b) => b.versionNumber - a.versionNumber);
  }, [versions]);

  // Default Version A = first (latest), Version B = second (previous)
  const defaultA = initialVersionAId || sortedVersions[0]?.id || '';
  const defaultB =
    initialVersionBId ||
    (sortedVersions.length > 1
      ? sortedVersions.find((v) => v.id !== defaultA)?.id || sortedVersions[1]?.id
      : sortedVersions[0]?.id) ||
    '';

  const [versionAId, setVersionAId] = useState<string>(defaultA);
  const [versionBId, setVersionBId] = useState<string>(defaultB);

  const verA = useMemo(
    () => sortedVersions.find((v) => v.id === versionAId) || sortedVersions[0],
    [sortedVersions, versionAId],
  );

  const verB = useMemo(
    () => sortedVersions.find((v) => v.id === versionBId) || sortedVersions[1] || sortedVersions[0],
    [sortedVersions, versionBId],
  );

  const isCurrentA = verA ? verA.id === currentVersionId : false;
  const isCurrentB = verB ? verB.id === currentVersionId : false;

  // File size delta calculation
  const sizeDelta = useMemo(() => {
    if (!verA || !verB) return null;
    const diff = verA.fileSize - verB.fileSize;
    if (diff === 0) return { text: 'Sin variación (0 B)', isIncrease: false, isDecrease: false };
    const prefix = diff > 0 ? '+' : '';
    const pct =
      verB.fileSize > 0
        ? ` (${diff > 0 ? '+' : ''}${((diff / verB.fileSize) * 100).toFixed(1)}%)`
        : '';
    return {
      text: `${prefix}${formatBytes(Math.abs(diff))}${pct}`,
      isIncrease: diff > 0,
      isDecrease: diff < 0,
    };
  }, [verA, verB]);

  // Checksum comparison
  const checksumsMatch = verA && verB && verA.checksum === verB.checksum;

  if (!verA || !verB) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        data-testid="version-comparison-modal"
        className="sm:max-w-3xl max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader className="border-b border-border/50 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <GitCompare className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <DialogTitle
                data-testid="version-comparison-modal-title"
                className="text-base font-bold text-foreground"
              >
                Comparación de Versiones de Metadatos
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground truncate mt-0.5">
                {documentTitle}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Version Selectors Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-muted/30 p-3 rounded-lg border border-border/50">
          {/* Selector Versión A */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="version-a-select"
              className="text-xs font-semibold text-foreground flex items-center justify-between"
            >
              <span>Versión Principal (A)</span>
              {isCurrentA && (
                <span className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.2 rounded">
                  Actual
                </span>
              )}
            </label>
            <Select
              id="version-a-select"
              data-testid="version-a-select"
              value={versionAId}
              onChange={(e) => setVersionAId(e.target.value)}
              className="h-9 text-xs font-medium shadow-xs"
            >
              {sortedVersions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.versionNumber} — {v.originalFileName} (
                  {v.id === currentVersionId ? 'Actual' : formatDate(v.createdAt)})
                </option>
              ))}
            </Select>
          </div>

          {/* Selector Versión B */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="version-b-select"
              className="text-xs font-semibold text-foreground flex items-center justify-between"
            >
              <span>Versión Comparada (B)</span>
              {isCurrentB && (
                <span className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.2 rounded">
                  Actual
                </span>
              )}
            </label>
            <Select
              id="version-b-select"
              data-testid="version-b-select"
              value={versionBId}
              onChange={(e) => setVersionBId(e.target.value)}
              className="h-9 text-xs font-medium shadow-xs"
            >
              {sortedVersions.map((v) => (
                <option key={v.id} value={v.id}>
                  v{v.versionNumber} — {v.originalFileName} (
                  {v.id === currentVersionId ? 'Actual' : formatDate(v.createdAt)})
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Comparison Matrix Table */}
        <div
          tabIndex={0}
          role="region"
          aria-label="Matriz comparativa de versiones"
          className="overflow-x-auto rounded-lg border border-border/60 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1"
        >
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-muted/40 border-b border-border/60 text-muted-foreground text-[11px]">
                <th className="py-2.5 px-3 font-semibold w-1/4">Atributo</th>
                <th className="py-2.5 px-3 font-semibold w-1/3">
                  <div className="flex items-center gap-1.5">
                    <span>Versión A (v{verA.versionNumber})</span>
                    {isCurrentA && (
                      <span className="text-[9px] bg-primary/10 text-primary px-1 py-0.2 rounded-full font-bold">
                        Vigente
                      </span>
                    )}
                  </div>
                </th>
                <th className="py-2.5 px-3 font-semibold w-1/3">
                  <div className="flex items-center gap-1.5">
                    <span>Versión B (v{verB.versionNumber})</span>
                    {isCurrentB && (
                      <span className="text-[9px] bg-primary/10 text-primary px-1 py-0.2 rounded-full font-bold">
                        Vigente
                      </span>
                    )}
                  </div>
                </th>
                <th className="py-2.5 px-3 font-semibold text-right">Variación / Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {/* Row 1: Version Number */}
              <tr data-testid="comparison-row-version" className="hover:bg-muted/20">
                <td className="py-2 px-3 font-medium text-muted-foreground">Número de versión</td>
                <td className="py-2 px-3 font-bold text-foreground">v{verA.versionNumber}</td>
                <td className="py-2 px-3 font-bold text-foreground">v{verB.versionNumber}</td>
                <td className="py-2 px-3 text-right">
                  {verA.versionNumber === verB.versionNumber ? (
                    <span className="text-muted-foreground">Misma versión</span>
                  ) : verA.versionNumber > verB.versionNumber ? (
                    <span className="text-primary font-medium">A es posterior</span>
                  ) : (
                    <span className="text-amber-600 font-medium">A es anterior</span>
                  )}
                </td>
              </tr>

              {/* Row 2: Filename */}
              <tr data-testid="comparison-row-filename" className="hover:bg-muted/20">
                <td className="py-2 px-3 font-medium text-muted-foreground">Nombre de archivo</td>
                <td
                  className="py-2 px-3 font-medium text-foreground truncate max-w-[160px]"
                  title={verA.originalFileName}
                >
                  {verA.originalFileName}
                </td>
                <td
                  className="py-2 px-3 font-medium text-foreground truncate max-w-[160px]"
                  title={verB.originalFileName}
                >
                  {verB.originalFileName}
                </td>
                <td className="py-2 px-3 text-right">
                  {verA.originalFileName === verB.originalFileName ? (
                    <span className="text-muted-foreground">Sin cambios</span>
                  ) : (
                    <span className="text-foreground font-semibold">Nombre modificado</span>
                  )}
                </td>
              </tr>

              {/* Row 3: MIME Type */}
              <tr data-testid="comparison-row-mimetype" className="hover:bg-muted/20">
                <td className="py-2 px-3 font-medium text-muted-foreground">Formato / MIME</td>
                <td className="py-2 px-3 font-mono text-[11px] text-foreground">{verA.mimeType}</td>
                <td className="py-2 px-3 font-mono text-[11px] text-foreground">{verB.mimeType}</td>
                <td className="py-2 px-3 text-right">
                  {verA.mimeType === verB.mimeType ? (
                    <span className="text-muted-foreground">Mismo tipo</span>
                  ) : (
                    <span className="text-amber-600 font-medium">Tipo cambiado</span>
                  )}
                </td>
              </tr>

              {/* Row 4: File Size */}
              <tr data-testid="comparison-row-filesize" className="hover:bg-muted/20">
                <td className="py-2 px-3 font-medium text-muted-foreground">Tamaño de archivo</td>
                <td className="py-2 px-3 font-mono text-foreground">
                  {formatBytes(verA.fileSize)}
                </td>
                <td className="py-2 px-3 font-mono text-foreground">
                  {formatBytes(verB.fileSize)}
                </td>
                <td className="py-2 px-3 text-right">
                  {sizeDelta && (
                    <span
                      data-testid="comparison-size-delta"
                      className={
                        sizeDelta.isIncrease
                          ? 'text-amber-600 dark:text-amber-400 font-semibold'
                          : sizeDelta.isDecrease
                            ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                            : 'text-muted-foreground'
                      }
                    >
                      {sizeDelta.text}
                    </span>
                  )}
                </td>
              </tr>

              {/* Row 5: Upload Date */}
              <tr data-testid="comparison-row-created-at" className="hover:bg-muted/20">
                <td className="py-2 px-3 font-medium text-muted-foreground">Fecha de subida</td>
                <td className="py-2 px-3 text-foreground">{formatDate(verA.createdAt)}</td>
                <td className="py-2 px-3 text-foreground">{formatDate(verB.createdAt)}</td>
                <td className="py-2 px-3 text-right text-muted-foreground">
                  {verA.createdAt === verB.createdAt ? 'Misma fecha' : 'Fechas distintas'}
                </td>
              </tr>

              {/* Row 6: Uploader */}
              <tr data-testid="comparison-row-uploader" className="hover:bg-muted/20">
                <td className="py-2 px-3 font-medium text-muted-foreground">Subido por</td>
                <td className="py-2 px-3 text-foreground">{verA.uploadedBy || 'Sistema'}</td>
                <td className="py-2 px-3 text-foreground">{verB.uploadedBy || 'Sistema'}</td>
                <td className="py-2 px-3 text-right text-muted-foreground">
                  {verA.uploadedBy === verB.uploadedBy ? 'Mismo autor' : 'Autores distintos'}
                </td>
              </tr>

              {/* Row 7: SHA-256 Checksum */}
              <tr data-testid="comparison-row-checksum" className="hover:bg-muted/20">
                <td className="py-2 px-3 font-medium text-muted-foreground">
                  Integridad (SHA-256)
                </td>
                <td
                  className="py-2 px-3 font-mono text-[10px] text-muted-foreground truncate max-w-[140px]"
                  title={verA.checksum}
                >
                  {verA.checksum.slice(0, 16)}...
                </td>
                <td
                  className="py-2 px-3 font-mono text-[10px] text-muted-foreground truncate max-w-[140px]"
                  title={verB.checksum}
                >
                  {verB.checksum.slice(0, 16)}...
                </td>
                <td className="py-2 px-3 text-right">
                  {checksumsMatch ? (
                    <span
                      data-testid="comparison-checksum-match"
                      className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold text-[11px]"
                    >
                      <ShieldCheck className="h-3 w-3" />
                      <span>Binario idéntico</span>
                    </span>
                  ) : (
                    <span
                      data-testid="comparison-checksum-diff"
                      className="inline-flex items-center gap-1 text-foreground font-semibold text-[11px]"
                    >
                      <ShieldAlert className="h-3 w-3 text-amber-500" />
                      <span>Contenido modificado</span>
                    </span>
                  )}
                </td>
              </tr>

              {/* Row 8: Ingestion / RAG Status */}
              <tr data-testid="comparison-row-ingestion" className="hover:bg-muted/20">
                <td className="py-2 px-3 font-medium text-muted-foreground">
                  Estado RAG / Indexación
                </td>
                <td className="py-2 px-3">
                  <IngestionStatusBadge status={verA.ingestionStatus} />
                </td>
                <td className="py-2 px-3">
                  <IngestionStatusBadge status={verB.ingestionStatus} />
                </td>
                <td className="py-2 px-3 text-right text-muted-foreground">
                  {isCurrentA
                    ? 'A es versión indexada'
                    : isCurrentB
                      ? 'B es versión indexada'
                      : 'Ambas archivadas'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Quick Version Actions Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          {/* Actions for Version A */}
          <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-muted/20 text-xs">
            <span className="font-semibold text-foreground">Acciones v{verA.versionNumber}:</span>
            <div className="flex items-center gap-1.5">
              {onPreviewVersion && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onClose();
                    onPreviewVersion(verA.id);
                  }}
                  data-testid="compare-preview-a-button"
                  className="h-7 text-xs gap-1"
                >
                  <Eye className="h-3 w-3" />
                  <span>Previsualizar</span>
                </Button>
              )}
              {onDownloadVersion && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDownloadVersion(verA)}
                  data-testid="compare-download-a-button"
                  className="h-7 text-xs gap-1"
                >
                  <Download className="h-3 w-3" />
                  <span>Descargar</span>
                </Button>
              )}
            </div>
          </div>

          {/* Actions for Version B */}
          <div className="flex items-center justify-between p-2.5 rounded-lg border border-border/50 bg-muted/20 text-xs">
            <span className="font-semibold text-foreground">Acciones v{verB.versionNumber}:</span>
            <div className="flex items-center gap-1.5">
              {onPreviewVersion && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    onClose();
                    onPreviewVersion(verB.id);
                  }}
                  data-testid="compare-preview-b-button"
                  className="h-7 text-xs gap-1"
                >
                  <Eye className="h-3 w-3" />
                  <span>Previsualizar</span>
                </Button>
              )}
              {onDownloadVersion && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDownloadVersion(verB)}
                  data-testid="compare-download-b-button"
                  className="h-7 text-xs gap-1"
                >
                  <Download className="h-3 w-3" />
                  <span>Descargar</span>
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Information note */}
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          * La comparación se realiza sobre los metadatos y sumas de verificación criptográficas
          registradas en el sistema. Todos los archivos históricos se preservan de forma inmutable y
          segura.
        </p>

        <DialogFooter className="pt-2 border-t border-border/40">
          <Button variant="outline" size="sm" onClick={onClose} className="text-xs">
            Cerrar Comparación
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
