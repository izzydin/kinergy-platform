import React, { useState, useEffect } from 'react';
import { Alert, AlertDescription, AlertTitle, Button } from '@kinergy-platform/ui';
import { AlertCircle, DoorClosed, Plus, RefreshCw, Users, Wrench, X } from 'lucide-react';
import type { RoomModel } from '../../types/scheduling.types';
import { useEditRoomMutation } from '../../hooks/use-scheduling-mutations';
import { formatSchedulingErrorMessage, isOptimisticLockError } from '../../api/scheduling-error';
import { editRoomSchema } from '../../schemas/room-management.schema';

export interface EditRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: RoomModel | null;
  onSuccess?: (updated: RoomModel) => void;
  onRefreshRoom?: () => void;
}

const COMMON_ROOM_FEATURES = [
  'soundproof',
  'hydrotherapy_tub',
  'adjustable_table',
  'mirrored_wall',
  'wheelchair_accessible',
  'sink',
  'equipment_storage',
  'dimmable_lighting',
];

export const EditRoomModal: React.FC<EditRoomModalProps> = ({
  isOpen,
  onClose,
  room,
  onSuccess,
  onRefreshRoom,
}) => {
  const editMutation = useEditRoomMutation();

  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState<number>(1);
  const [features, setFeatures] = useState<string[]>([]);
  const [customFeature, setCustomFeature] = useState('');
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [isVersionConflict, setIsVersionConflict] = useState(false);

  useEffect(() => {
    if (room) {
      setName(room.name);
      setCapacity(room.capacity);
      setFeatures(room.features || []);
      setClientErrors({});
      setServerError(null);
      setIsVersionConflict(false);
    }
  }, [room]);

  if (!isOpen || !room) return null;

  const toggleFeature = (feat: string) => {
    setFeatures((prev) => (prev.includes(feat) ? prev.filter((f) => f !== feat) : [...prev, feat]));
  };

  const handleAddCustomFeature = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customFeature.trim().toLowerCase().replace(/\s+/g, '_');
    if (trimmed && !features.includes(trimmed)) {
      setFeatures((prev) => [...prev, trimmed]);
      setCustomFeature('');
    }
  };

  const removeFeature = (feat: string) => {
    setFeatures((prev) => prev.filter((f) => f !== feat));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setClientErrors({});
    setServerError(null);
    setIsVersionConflict(false);

    const validationResult = editRoomSchema.safeParse({
      name,
      capacity,
      features,
      expectedVersion: room.version,
    });

    if (!validationResult.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of validationResult.error.issues) {
        const path = issue.path[0];
        if (path && typeof path === 'string') {
          fieldErrors[path] = issue.message;
        }
      }
      setClientErrors(fieldErrors);
      return;
    }

    editMutation.mutate(
      {
        id: room.id,
        payload: {
          name: name.trim(),
          capacity,
          features,
          expectedVersion: room.version,
        },
      },
      {
        onSuccess: (updated) => {
          onSuccess?.(updated);
          onClose();
        },
        onError: (err) => {
          if (isOptimisticLockError(err)) {
            setIsVersionConflict(true);
            setServerError(
              'This room was updated by another staff member. Please refresh the latest state before saving changes.',
            );
          } else {
            setServerError(formatSchedulingErrorMessage(err));
          }
        },
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-room-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/20">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <DoorClosed className="h-5 w-5" />
              </div>
              <div>
                <h3 id="edit-room-title" className="text-base font-semibold text-foreground">
                  Edit Room: {room.name}
                </h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    ID: <code className="font-mono">{room.id}</code>
                  </span>
                  <span>•</span>
                  <span>Version #{room.version}</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={editMutation.isPending}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close dialog"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Form Body */}
          <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            {serverError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>
                  {isVersionConflict ? 'Concurrency Version Conflict' : 'Update Failed'}
                </AlertTitle>
                <AlertDescription className="text-xs mt-1 space-y-2">
                  <p>{serverError}</p>
                  {isVersionConflict && onRefreshRoom && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onRefreshRoom();
                        onClose();
                      }}
                      className="mt-2 text-xs gap-1.5"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Reload Latest Room State
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Room Name */}
            <div className="space-y-1.5">
              <label htmlFor="edit-room-name" className="text-xs font-semibold text-foreground">
                Room Name <span className="text-destructive">*</span>
              </label>
              <input
                id="edit-room-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full text-xs rounded-md border ${
                  clientErrors.name ? 'border-destructive' : 'border-input'
                } bg-background px-3 py-2 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring`}
                disabled={editMutation.isPending}
                required
              />
              {clientErrors.name && (
                <p className="text-[11px] text-destructive">{clientErrors.name}</p>
              )}
            </div>

            {/* Room Capacity */}
            <div className="space-y-1.5">
              <label
                htmlFor="edit-room-capacity"
                className="text-xs font-semibold text-foreground flex items-center gap-1.5"
              >
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span>
                  Maximum Client Capacity <span className="text-destructive">*</span>
                </span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  id="edit-room-capacity"
                  type="number"
                  min="1"
                  max="100"
                  value={capacity}
                  onChange={(e) => setCapacity(parseInt(e.target.value, 10) || 1)}
                  className={`w-32 text-xs rounded-md border ${
                    clientErrors.capacity ? 'border-destructive' : 'border-input'
                  } bg-background px-3 py-2 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring`}
                  disabled={editMutation.isPending}
                  required
                />
                <span className="text-xs text-muted-foreground">
                  Individual appointments require at least capacity for 1 client.
                </span>
              </div>
              {clientErrors.capacity && (
                <p className="text-[11px] text-destructive">{clientErrors.capacity}</p>
              )}
            </div>

            {/* Equipment & Features */}
            <div className="space-y-2 pt-2 border-t border-border">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Equipment & Facility Features</span>
              </label>

              {/* Standard presets */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {COMMON_ROOM_FEATURES.map((feat) => {
                  const isSelected = features.includes(feat);
                  return (
                    <button
                      key={feat}
                      type="button"
                      onClick={() => toggleFeature(feat)}
                      disabled={editMutation.isPending}
                      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                        isSelected
                          ? 'bg-primary/10 border-primary text-primary font-medium'
                          : 'bg-muted/40 border-border text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {feat.replace(/_/g, ' ')} {isSelected && '✓'}
                    </button>
                  );
                })}
              </div>

              {/* Custom feature */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="text"
                  placeholder="Add custom feature..."
                  value={customFeature}
                  onChange={(e) => setCustomFeature(e.target.value)}
                  className="flex-1 text-xs rounded-md border border-input bg-background px-3 py-1.5 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                  disabled={editMutation.isPending}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomFeature(e);
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAddCustomFeature}
                  disabled={!customFeature.trim() || editMutation.isPending}
                  className="h-8 text-xs"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>

              {features.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1.5">
                  <span className="text-[11px] text-muted-foreground self-center mr-1">
                    Selected:
                  </span>
                  {features.map((feat) => (
                    <span
                      key={feat}
                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground border border-border"
                    >
                      <span>{feat}</span>
                      <button
                        type="button"
                        onClick={() => removeFeature(feat)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Remove feature ${feat}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2.5 border-t border-border px-6 py-4 bg-muted/20">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={editMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={editMutation.isPending || !name.trim()}
              className="gap-1.5"
            >
              {editMutation.isPending ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  <span>Saving Changes...</span>
                </>
              ) : (
                <span>Save Changes</span>
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
