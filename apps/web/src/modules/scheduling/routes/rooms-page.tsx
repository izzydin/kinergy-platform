import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@kinergy-platform/ui';
import { Calendar, DoorClosed, Plus, RefreshCw, Search, Users, Wrench } from 'lucide-react';
import { useAuth } from '../../../app/providers/auth-provider';
import { ForbiddenView } from '../../../app/routes/fallback-views';
import { useRoomsList } from '../hooks/use-scheduling-queries';
import type { RoomModel, RoomStatus } from '../types/scheduling.types';
import {
  RoomCard,
  CreateRoomModal,
  EditRoomModal,
  DeactivateRoomModal,
  ScheduleMaintenanceModal,
  RoomDetailModal,
  RoomAvailabilityChecker,
} from '../components/rooms';
import { FACILITY_TIMEZONE } from '../utils/calendar-date.utils';

export const RoomsPage: React.FC = () => {
  const auth = useAuth();

  const canRead = Boolean(
    typeof auth.hasPermission === 'function'
      ? auth.hasPermission('settings.read') || auth.hasPermission('*')
      : auth.currentUser?.permissions?.some(
          (p) => p === 'settings.read' || p === 'settings:read' || p === '*',
        ) ||
          auth.currentUser?.roles?.some((r) =>
            ['ADMIN', 'SUPER_ADMIN', 'RECEPTIONIST', 'THERAPIST'].includes(r),
          ),
  );

  const canManage = Boolean(
    typeof auth.hasPermission === 'function'
      ? auth.hasPermission('settings.write') || auth.hasPermission('*')
      : auth.currentUser?.permissions?.some(
          (p) => p === 'settings.write' || p === 'settings:write' || p === '*',
        ) || auth.currentUser?.roles?.some((r) => ['ADMIN', 'SUPER_ADMIN'].includes(r)),
  );

  // Filters State
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | RoomStatus>('ALL');
  const [minCapacityFilter, setMinCapacityFilter] = useState<number>(1);
  const [selectedFeature, setSelectedFeature] = useState<string>('ALL');
  const [showAvailabilityChecker, setShowAvailabilityChecker] = useState(false);

  // Modals State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedRoomForDetail, setSelectedRoomForDetail] = useState<RoomModel | null>(null);
  const [selectedRoomForEdit, setSelectedRoomForEdit] = useState<RoomModel | null>(null);
  const [selectedRoomForDeactivate, setSelectedRoomForDeactivate] = useState<RoomModel | null>(
    null,
  );
  const [selectedRoomForMaintenance, setSelectedRoomForMaintenance] = useState<RoomModel | null>(
    null,
  );

  // Queries
  const {
    data: rooms = [],
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useRoomsList(undefined, { enabled: canRead });

  // Extract all unique features across all rooms
  const allFeatures = useMemo(() => {
    const set = new Set<string>();
    rooms.forEach((r) => r.features?.forEach((f) => set.add(f)));
    return Array.from(set).sort();
  }, [rooms]);

  // Client-side filtering
  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchesName = room.name.toLowerCase().includes(term);
        const matchesId = room.id.toLowerCase().includes(term);
        if (!matchesName && !matchesId) return false;
      }

      // Status
      if (statusFilter !== 'ALL' && room.status !== statusFilter) {
        return false;
      }

      // Min capacity
      if (room.capacity < minCapacityFilter) {
        return false;
      }

      // Feature
      if (selectedFeature !== 'ALL') {
        if (!room.features || !room.features.includes(selectedFeature)) {
          return false;
        }
      }

      return true;
    });
  }, [rooms, searchTerm, statusFilter, minCapacityFilter, selectedFeature]);

  const isFiltered =
    searchTerm.trim() !== '' ||
    statusFilter !== 'ALL' ||
    minCapacityFilter > 1 ||
    selectedFeature !== 'ALL';

  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('ALL');
    setMinCapacityFilter(1);
    setSelectedFeature('ALL');
  };

  if (!canRead) {
    return (
      <ForbiddenView message="You do not have permission to view room directories and spatial settings (requires settings.read)." />
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6" id="room-directory-page">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Room & Resource Directory
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
              {rooms.length} {rooms.length === 1 ? 'Room' : 'Rooms'}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
            Authoritative room capacities, equipment feature tags, and temporal maintenance windows
            ({FACILITY_TIMEZONE}).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
            className="text-xs gap-1.5"
            title="Refresh room list"
            aria-label="Refresh room list"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowAvailabilityChecker((prev) => !prev)}
            className={`text-xs gap-1.5 ${showAvailabilityChecker ? 'bg-muted' : ''}`}
          >
            <Wrench className="h-3.5 w-3.5" />
            <span>{showAvailabilityChecker ? 'Hide Availability Tool' : 'Live Availability'}</span>
          </Button>

          <Link to="/scheduling">
            <Button type="button" variant="outline" size="sm" className="text-xs gap-1.5">
              <Calendar className="h-3.5 w-3.5" />
              <span>Calendar</span>
            </Button>
          </Link>

          {canManage && (
            <Button
              type="button"
              size="sm"
              onClick={() => setIsCreateModalOpen(true)}
              className="text-xs gap-1.5"
              aria-label="Add Room"
            >
              <Plus className="h-4 w-4" />
              <span>Add Room</span>
            </Button>
          )}
        </div>
      </div>

      {/* Live Availability Checker Section (Collapsible) */}
      {showAvailabilityChecker && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-150">
          <RoomAvailabilityChecker rooms={rooms} />
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {/* Search by Name */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search by room name or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs rounded-md border border-input bg-background pl-9 pr-3 py-2 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              aria-label="Search rooms"
            />
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | RoomStatus)}
              className="w-full text-xs rounded-md border border-input bg-background px-3 py-2 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              aria-label="Filter by operational status"
            >
              <option value="ALL">All Statuses</option>
              <option value="AVAILABLE">Available for Booking</option>
              <option value="UNAVAILABLE">Unavailable / Offline</option>
              <option value="MAINTENANCE">In Maintenance</option>
            </select>
          </div>

          {/* Min Capacity Filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
              <Users className="h-3.5 w-3.5" />
              <span>Min Cap:</span>
            </span>
            <input
              type="number"
              min="1"
              max="50"
              value={minCapacityFilter}
              onChange={(e) => setMinCapacityFilter(parseInt(e.target.value, 10) || 1)}
              className="w-full text-xs rounded-md border border-input bg-background px-3 py-2 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              aria-label="Filter by minimum client capacity"
            />
          </div>

          {/* Equipment Feature Filter */}
          <div>
            <select
              value={selectedFeature}
              onChange={(e) => setSelectedFeature(e.target.value)}
              className="w-full text-xs rounded-md border border-input bg-background px-3 py-2 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
              aria-label="Filter by equipment feature"
            >
              <option value="ALL">All Equipment Features</option>
              {allFeatures.map((f) => (
                <option key={f} value={f}>
                  {f.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter Summary & Reset */}
        {isFiltered && (
          <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
            <span className="text-muted-foreground">
              Showing <strong>{filteredRooms.length}</strong> of {rooms.length} rooms matching
              filters
            </span>
            <button
              type="button"
              onClick={resetFilters}
              className="text-primary hover:underline font-medium text-xs"
            >
              Clear Filters
            </button>
          </div>
        )}
      </div>

      {/* Directory Content Area */}
      <div>
        {/* Loading State */}
        {isLoading && (
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            aria-busy="true"
            aria-label="Loading rooms directory"
          >
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-44 rounded-xl border border-border bg-muted/20 animate-pulse p-4 space-y-3"
              >
                <div className="h-5 w-3/4 bg-muted/40 rounded" />
                <div className="h-4 w-1/2 bg-muted/30 rounded" />
                <div className="h-10 w-full bg-muted/20 rounded mt-4" />
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {isError && !isLoading && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
            <p className="text-sm font-semibold text-destructive">Failed to load room directory</p>
            <p className="text-xs text-muted-foreground">
              {error instanceof Error ? error.message : 'An unexpected error occurred.'}
            </p>
            <Button type="button" size="sm" variant="outline" onClick={() => refetch()}>
              Try Again
            </Button>
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !isError && filteredRooms.length === 0 && (
          <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center space-y-3">
            <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground mx-auto">
              <DoorClosed className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="text-base font-semibold text-foreground">
                {isFiltered ? 'No Matching Rooms Found' : 'No Rooms Registered Yet'}
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                {isFiltered
                  ? 'No registered rooms match your current search and capacity filters. Try clearing your filters.'
                  : 'Get started by registering spatial therapy rooms, treatment suites, or consultation spaces.'}
              </p>
            </div>
            <div>
              {isFiltered ? (
                <Button type="button" size="sm" variant="outline" onClick={resetFilters}>
                  Clear Filters
                </Button>
              ) : (
                canManage && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setIsCreateModalOpen(true)}
                    className="gap-1.5"
                  >
                    <Plus className="h-4 w-4" />
                    <span>Register First Room</span>
                  </Button>
                )
              )}
            </div>
          </div>
        )}

        {/* Populated Grid */}
        {!isLoading && !isError && filteredRooms.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                canManageRooms={canManage}
                onViewDetails={(r) => setSelectedRoomForDetail(r)}
                onEdit={(r) => setSelectedRoomForEdit(r)}
                onDeactivate={(r) => setSelectedRoomForDeactivate(r)}
                onScheduleMaintenance={(r) => setSelectedRoomForMaintenance(r)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      <CreateRoomModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => refetch()}
      />

      <EditRoomModal
        isOpen={Boolean(selectedRoomForEdit)}
        onClose={() => setSelectedRoomForEdit(null)}
        room={selectedRoomForEdit}
        onSuccess={() => refetch()}
        onRefreshRoom={() => refetch()}
      />

      <DeactivateRoomModal
        isOpen={Boolean(selectedRoomForDeactivate)}
        onClose={() => setSelectedRoomForDeactivate(null)}
        room={selectedRoomForDeactivate}
        onSuccess={() => refetch()}
      />

      <ScheduleMaintenanceModal
        isOpen={Boolean(selectedRoomForMaintenance)}
        onClose={() => setSelectedRoomForMaintenance(null)}
        room={selectedRoomForMaintenance}
        onSuccess={() => refetch()}
      />

      <RoomDetailModal
        isOpen={Boolean(selectedRoomForDetail)}
        onClose={() => setSelectedRoomForDetail(null)}
        room={selectedRoomForDetail}
        canManageRooms={canManage}
        onEditRoom={(r) => {
          setSelectedRoomForDetail(null);
          setSelectedRoomForEdit(r);
        }}
        onDeactivateRoom={(r) => {
          setSelectedRoomForDetail(null);
          setSelectedRoomForDeactivate(r);
        }}
        onScheduleMaintenance={(r) => {
          setSelectedRoomForDetail(null);
          setSelectedRoomForMaintenance(r);
        }}
      />
    </div>
  );
};
