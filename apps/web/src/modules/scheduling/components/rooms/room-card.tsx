import React from 'react';
import { Button } from '@kinergy-platform/ui';
import { CheckCircle2, DoorClosed, Edit2, Info, PowerOff, Users, Wrench } from 'lucide-react';
import type { RoomModel } from '../../types/scheduling.types';
import { RoomStatusBadge } from './room-status-badge';
import { useActivateRoomMutation } from '../../hooks/use-scheduling-mutations';

export interface RoomCardProps {
  room: RoomModel;
  canManageRooms?: boolean;
  onViewDetails: (room: RoomModel) => void;
  onEdit: (room: RoomModel) => void;
  onDeactivate: (room: RoomModel) => void;
  onScheduleMaintenance: (room: RoomModel) => void;
}

export const RoomCard: React.FC<RoomCardProps> = ({
  room,
  canManageRooms = false,
  onViewDetails,
  onEdit,
  onDeactivate,
  onScheduleMaintenance,
}) => {
  const activateMutation = useActivateRoomMutation();

  const nowIso = new Date().toISOString();
  const hasActiveMaintenance =
    room.maintenanceWindows &&
    room.maintenanceWindows.some((mw) => mw.startTime <= nowIso && mw.endTime >= nowIso);

  const upcomingMaintenanceCount =
    room.maintenanceWindows?.filter((mw) => mw.endTime >= nowIso).length || 0;

  const handleActivate = (e: React.MouseEvent) => {
    e.stopPropagation();
    activateMutation.mutate({
      id: room.id,
      payload: { expectedVersion: room.version },
    });
  };

  return (
    <div
      className="rounded-xl border border-border bg-card p-4 shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between gap-3 text-card-foreground group"
      data-testid={`room-card-${room.id}`}
    >
      {/* Top Header */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0 group-hover:bg-primary/20 transition-colors">
              <DoorClosed className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground leading-tight">{room.name}</h4>
              <span className="text-[11px] text-muted-foreground font-mono">{room.id}</span>
            </div>
          </div>
          <RoomStatusBadge
            status={room.status}
            size="sm"
            hasActiveMaintenance={hasActiveMaintenance}
          />
        </div>

        {/* Capacity & Maintenance Indicators */}
        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5" title="Maximum Client Capacity">
            <Users className="h-3.5 w-3.5 text-foreground/70" />
            <span>
              Capacity: <strong className="text-foreground">{room.capacity}</strong>
            </span>
          </div>

          {upcomingMaintenanceCount > 0 && (
            <div
              className="flex items-center gap-1 text-[11px] text-amber-600 dark:text-amber-400 font-medium"
              title={`${upcomingMaintenanceCount} scheduled maintenance block(s)`}
            >
              <Wrench className="h-3 w-3" />
              <span>{upcomingMaintenanceCount} maintenance</span>
            </div>
          )}

          <span className="text-[10px] text-muted-foreground ml-auto">v{room.version}</span>
        </div>

        {/* Equipment / Feature Tags */}
        <div className="pt-2 border-t border-border/60">
          {room.features && room.features.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {room.features.slice(0, 4).map((feat) => (
                <span
                  key={feat}
                  className="text-[10px] px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border/50"
                >
                  {feat.replace(/_/g, ' ')}
                </span>
              ))}
              {room.features.length > 4 && (
                <span className="text-[10px] text-muted-foreground self-center">
                  +{room.features.length - 4} more
                </span>
              )}
            </div>
          ) : (
            <span className="text-[11px] text-muted-foreground italic">Standard therapy room</span>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="pt-3 border-t border-border/80 flex items-center justify-between gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => onViewDetails(room)}
          className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground gap-1"
          aria-label={`View details for ${room.name}`}
        >
          <Info className="h-3.5 w-3.5" />
          <span>Details</span>
        </Button>

        {canManageRooms && (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => onScheduleMaintenance(room)}
              className="text-xs h-7 px-2 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20 border-amber-300 dark:border-amber-800 gap-1"
              title="Schedule maintenance"
              aria-label={`Schedule maintenance for ${room.name}`}
            >
              <Wrench className="h-3 w-3" />
              <span className="hidden sm:inline">Maint.</span>
            </Button>

            {room.status === 'AVAILABLE' ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onDeactivate(room)}
                className="text-xs h-7 px-2 text-destructive hover:bg-destructive/10"
                title="Deactivate room"
                aria-label={`Deactivate ${room.name}`}
              >
                <PowerOff className="h-3 w-3" />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={handleActivate}
                disabled={activateMutation.isPending}
                className="text-xs h-7 px-2 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/20"
                title="Activate room"
                aria-label={`Activate ${room.name}`}
              >
                <CheckCircle2 className="h-3 w-3" />
              </Button>
            )}

            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => onEdit(room)}
              className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground"
              title="Edit room properties"
              aria-label={`Edit ${room.name}`}
            >
              <Edit2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
