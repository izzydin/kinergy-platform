import React, { useState } from 'react';
import { Alert, AlertDescription, AlertTitle, Button } from '@kinergy-platform/ui';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  DoorClosed,
  Edit2,
  PowerOff,
  Trash2,
  Users,
  Wrench,
  X,
} from 'lucide-react';
import type { RoomModel } from '../../types/scheduling.types';
import { RoomStatusBadge } from './room-status-badge';
import {
  useActivateRoomMutation,
  useCancelMaintenanceMutation,
} from '../../hooks/use-scheduling-mutations';
import {
  formatFacilityDate,
  formatFacilityTime,
  FACILITY_TIMEZONE,
} from '../../utils/calendar-date.utils';
import { formatSchedulingErrorMessage } from '../../api/scheduling-error';

export interface RoomDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: RoomModel | null;
  canManageRooms?: boolean;
  onEditRoom?: (room: RoomModel) => void;
  onDeactivateRoom?: (room: RoomModel) => void;
  onScheduleMaintenance?: (room: RoomModel) => void;
}

export const RoomDetailModal: React.FC<RoomDetailModalProps> = ({
  isOpen,
  onClose,
  room,
  canManageRooms = false,
  onEditRoom,
  onDeactivateRoom,
  onScheduleMaintenance,
}) => {
  const activateMutation = useActivateRoomMutation();
  const cancelMaintenanceMutation = useCancelMaintenanceMutation();

  const [confirmCancelMaintId, setConfirmCancelMaintId] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  if (!isOpen || !room) return null;

  const handleActivate = () => {
    setServerError(null);
    activateMutation.mutate(
      {
        id: room.id,
        payload: { expectedVersion: room.version },
      },
      {
        onError: (err) => {
          setServerError(formatSchedulingErrorMessage(err));
        },
      },
    );
  };

  const handleCancelMaintenance = (maintenanceId: string) => {
    setServerError(null);
    cancelMaintenanceMutation.mutate(
      {
        id: room.id,
        maintenanceId,
      },
      {
        onSuccess: () => {
          setConfirmCancelMaintId(null);
        },
        onError: (err) => {
          setServerError(formatSchedulingErrorMessage(err));
        },
      },
    );
  };

  const hasActiveMaintenance =
    room.maintenanceWindows &&
    room.maintenanceWindows.some((mw) => {
      const now = new Date().toISOString();
      return mw.startTime <= now && mw.endTime >= now;
    });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-xs p-4 animate-in fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="room-detail-title"
    >
      <div className="w-full max-w-xl rounded-xl border border-border bg-card shadow-2xl overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <DoorClosed className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 id="room-detail-title" className="text-base font-semibold text-foreground">
                  {room.name}
                </h3>
                <RoomStatusBadge
                  status={room.status}
                  size="sm"
                  hasActiveMaintenance={hasActiveMaintenance}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Capacity: {room.capacity} {room.capacity === 1 ? 'person' : 'people'} • Version #
                {room.version}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {serverError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Operation Failed</AlertTitle>
              <AlertDescription className="text-xs mt-1">{serverError}</AlertDescription>
            </Alert>
          )}

          {/* Deactivation / Offline Explanation Alert */}
          {room.status === 'UNAVAILABLE' && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 p-3.5 text-xs text-amber-900 dark:text-amber-300 space-y-1">
              <div className="flex items-center gap-1.5 font-semibold">
                <PowerOff className="h-4 w-4 text-amber-600" />
                <span>Room is Currently Unavailable</span>
              </div>
              {room.maintenanceReason ? (
                <p className="text-[11px] text-amber-800 dark:text-amber-400">
                  Reason: <em>"{room.maintenanceReason}"</em>
                </p>
              ) : (
                <p className="text-[11px] text-amber-800 dark:text-amber-400">
                  This room was taken offline by facility administrators. New bookings cannot be
                  scheduled.
                </p>
              )}
            </div>
          )}

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
            <div className="rounded-lg border border-border p-3 bg-muted/20 space-y-1">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Users className="h-3 w-3" />
                <span>Max Capacity</span>
              </span>
              <p className="text-sm font-semibold text-foreground">
                {room.capacity} {room.capacity === 1 ? 'Client' : 'Clients'}
              </p>
            </div>

            <div className="rounded-lg border border-border p-3 bg-muted/20 space-y-1">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>Facility Timezone</span>
              </span>
              <p className="text-sm font-semibold text-foreground">{FACILITY_TIMEZONE}</p>
            </div>

            <div className="rounded-lg border border-border p-3 bg-muted/20 space-y-1 col-span-2 sm:col-span-1">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <Wrench className="h-3 w-3" />
                <span>Maintenance Blocks</span>
              </span>
              <p className="text-sm font-semibold text-foreground">
                {room.maintenanceWindows?.length || 0} scheduled
              </p>
            </div>
          </div>

          {/* Feature Tags */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span>Facility Equipment & Features</span>
            </h4>
            {room.features && room.features.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {room.features.map((feat) => (
                  <span
                    key={feat}
                    className="text-xs px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground border border-border"
                  >
                    {feat.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">
                No specialized equipment tags defined.
              </p>
            )}
          </div>

          {/* Scheduled Maintenance Windows Section */}
          <div className="space-y-2.5 pt-3 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Wrench className="h-3.5 w-3.5 text-amber-600" />
                  <span>Scheduled Maintenance Windows</span>
                </h4>
                <p className="text-[11px] text-muted-foreground">
                  Temporal blocks preventing overlapping appointment bookings.
                </p>
              </div>

              {canManageRooms && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onScheduleMaintenance?.(room)}
                  className="h-7 text-xs gap-1"
                >
                  <Wrench className="h-3 w-3" />
                  Schedule Window
                </Button>
              )}
            </div>

            {room.maintenanceWindows && room.maintenanceWindows.length > 0 ? (
              <div className="space-y-2">
                {room.maintenanceWindows.map((mw) => {
                  const isCurrent =
                    mw.startTime <= new Date().toISOString() &&
                    mw.endTime >= new Date().toISOString();

                  return (
                    <div
                      key={mw.id}
                      className={`p-3 rounded-lg border text-xs flex items-start justify-between gap-3 ${
                        isCurrent
                          ? 'bg-amber-500/10 border-amber-300 dark:border-amber-800 text-amber-950 dark:text-amber-200'
                          : 'bg-muted/20 border-border text-foreground'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">
                            {formatFacilityDate(mw.startTime)} • {formatFacilityTime(mw.startTime)}{' '}
                            – {formatFacilityTime(mw.endTime)}
                          </span>
                          {isCurrent && (
                            <span className="bg-amber-500 text-white text-[10px] px-1.5 py-0.2 rounded font-medium">
                              Active Now
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Reason: <strong>{mw.reason}</strong>
                        </p>
                      </div>

                      {canManageRooms && (
                        <div>
                          {confirmCancelMaintId === mw.id ? (
                            <div className="flex items-center gap-1.5 animate-in fade-in">
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() => handleCancelMaintenance(mw.id)}
                                disabled={cancelMaintenanceMutation.isPending}
                                className="h-6 text-[10px] px-2"
                              >
                                Confirm
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirmCancelMaintId(null)}
                                className="h-6 text-[10px] px-2"
                              >
                                Cancel
                              </Button>
                            </div>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirmCancelMaintId(mw.id)}
                              className="h-7 text-xs text-destructive hover:bg-destructive/10 gap-1 px-2"
                              title="Cancel maintenance block"
                              aria-label={`Cancel maintenance window on ${formatFacilityDate(mw.startTime)}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span className="hidden sm:inline">Remove</span>
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-3.5 rounded-lg border border-dashed border-border bg-muted/10 text-center text-xs text-muted-foreground">
                No active or upcoming maintenance windows scheduled for this room.
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-border px-6 py-4 bg-muted/20">
          <div className="flex items-center gap-2">
            {canManageRooms && (
              <>
                {room.status === 'AVAILABLE' ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onDeactivateRoom?.(room)}
                    className="text-xs text-amber-600 dark:text-amber-400 gap-1.5 border-amber-300 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                  >
                    <PowerOff className="h-3.5 w-3.5" />
                    Deactivate
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleActivate}
                    disabled={activateMutation.isPending}
                    className="text-xs text-emerald-600 dark:text-emerald-400 gap-1.5 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {activateMutation.isPending ? 'Activating...' : 'Activate Room'}
                  </Button>
                )}

                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onEditRoom?.(room)}
                  className="text-xs gap-1.5"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  Edit Details
                </Button>
              </>
            )}
          </div>

          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
