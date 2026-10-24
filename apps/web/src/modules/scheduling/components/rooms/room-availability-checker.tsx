import React, { useState, useMemo } from 'react';
import { Alert, AlertDescription, AlertTitle, Button } from '@kinergy-platform/ui';
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  DoorClosed,
  Search,
  Users,
} from 'lucide-react';
import type { RoomModel } from '../../types/scheduling.types';
import { useRoomAvailability } from '../../hooks/use-scheduling-queries';
import {
  FACILITY_TIMEZONE,
  facilityDateTimeToUtcIso,
  getTodayFacilityDate,
} from '../../utils/calendar-date.utils';

export interface RoomAvailabilityCheckerProps {
  rooms: RoomModel[];
  onSelectAvailableRoom?: (roomId: string) => void;
}

export const RoomAvailabilityChecker: React.FC<RoomAvailabilityCheckerProps> = ({
  rooms,
  onSelectAvailableRoom,
}) => {
  const [date, setDate] = useState(() => getTodayFacilityDate());
  const [startTime, setStartTime] = useState('10:00');
  const [endTime, setEndTime] = useState('11:00');
  const [selectedRoomId, setSelectedRoomId] = useState<string>('ALL');
  const [requiredCapacity, setRequiredCapacity] = useState<number>(1);

  // Compute UTC ISO timestamps
  const queryParams = useMemo(() => {
    if (!date || !startTime || !endTime || endTime <= startTime) {
      return null;
    }

    const startUtcIso = facilityDateTimeToUtcIso(date, startTime);
    const endUtcIso = facilityDateTimeToUtcIso(date, endTime);

    return {
      startTime: startUtcIso,
      endTime: endUtcIso,
      roomId: selectedRoomId !== 'ALL' ? selectedRoomId : undefined,
      requiredCapacity: requiredCapacity > 1 ? requiredCapacity : undefined,
    };
  }, [date, startTime, endTime, selectedRoomId, requiredCapacity]);

  const { data, isLoading, isError, error } = useRoomAvailability(
    queryParams || { startTime: '', endTime: '' },
    { enabled: Boolean(queryParams) },
  );

  const isValidRange = endTime > startTime;

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-xs text-card-foreground space-y-4">
      <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2.5">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <Search className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Live Room Availability Evaluation
            </h3>
            <p className="text-xs text-muted-foreground">
              Authoritatively check room availability against bookings, maintenance blocks, and
              capacity constraints ({FACILITY_TIMEZONE}).
            </p>
          </div>
        </div>
      </div>

      {/* Query Parameters Form */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Date */}
        <div className="space-y-1">
          <label
            htmlFor="avail-date"
            className="text-xs font-medium text-foreground flex items-center gap-1"
          >
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <span>Target Date</span>
          </label>
          <input
            id="avail-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full text-xs rounded-md border border-input bg-background px-2.5 py-1.5 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {/* Start Time */}
        <div className="space-y-1">
          <label
            htmlFor="avail-start"
            className="text-xs font-medium text-foreground flex items-center gap-1"
          >
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span>Start Time</span>
          </label>
          <input
            id="avail-start"
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="w-full text-xs rounded-md border border-input bg-background px-2.5 py-1.5 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {/* End Time */}
        <div className="space-y-1">
          <label
            htmlFor="avail-end"
            className="text-xs font-medium text-foreground flex items-center gap-1"
          >
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span>End Time</span>
          </label>
          <input
            id="avail-end"
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className={`w-full text-xs rounded-md border ${
              !isValidRange ? 'border-destructive' : 'border-input'
            } bg-background px-2.5 py-1.5 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring`}
          />
        </div>

        {/* Room Filter */}
        <div className="space-y-1">
          <label
            htmlFor="avail-room"
            className="text-xs font-medium text-foreground flex items-center gap-1"
          >
            <DoorClosed className="h-3 w-3 text-muted-foreground" />
            <span>Evaluate Room</span>
          </label>
          <select
            id="avail-room"
            value={selectedRoomId}
            onChange={(e) => setSelectedRoomId(e.target.value)}
            className="w-full text-xs rounded-md border border-input bg-background px-2.5 py-1.5 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="ALL">All Rooms</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name} (Cap: {r.capacity})
              </option>
            ))}
          </select>
        </div>

        {/* Min Capacity */}
        <div className="space-y-1">
          <label
            htmlFor="avail-capacity"
            className="text-xs font-medium text-foreground flex items-center gap-1"
          >
            <Users className="h-3 w-3 text-muted-foreground" />
            <span>Min Capacity</span>
          </label>
          <input
            id="avail-capacity"
            type="number"
            min="1"
            max="50"
            value={requiredCapacity}
            onChange={(e) => setRequiredCapacity(parseInt(e.target.value, 10) || 1)}
            className="w-full text-xs rounded-md border border-input bg-background px-2.5 py-1.5 shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
      </div>

      {!isValidRange && (
        <p className="text-xs text-destructive">End time must be later than start time.</p>
      )}

      {/* Results Presentation */}
      <div className="pt-2">
        {isLoading && (
          <div className="p-4 rounded-lg border border-border bg-muted/20 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span>Querying authoritative room availability...</span>
          </div>
        )}

        {isError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Availability Query Failed</AlertTitle>
            <AlertDescription className="text-xs mt-1">
              {error instanceof Error ? error.message : 'Unable to check availability.'}
            </AlertDescription>
          </Alert>
        )}

        {data && !isLoading && (
          <div className="space-y-3">
            {selectedRoomId !== 'ALL' ? (
              /* Single room evaluation result */
              <div
                className={`p-4 rounded-lg border text-xs flex items-start gap-3 ${
                  data.isAvailable
                    ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                    : 'bg-red-50/60 dark:bg-red-950/20 border-red-200 dark:border-red-800 text-red-900 dark:text-red-200'
                }`}
              >
                {data.isAvailable ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <p className="font-semibold text-sm">
                    {data.isAvailable
                      ? 'Room is Available'
                      : 'Room is Unavailable for Requested Slot'}
                  </p>
                  <p className="text-xs">
                    {data.isAvailable
                      ? 'No conflicting appointments, maintenance blocks, or deactivations were found for this time window.'
                      : data.reason ||
                        'This room has an active booking or scheduled maintenance block overlapping with the selected time.'}
                  </p>
                </div>
              </div>
            ) : (
              /* All rooms candidate list */
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-foreground">
                    Available Candidate Rooms ({data.availableRooms?.length || 0} of {rooms.length})
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Advisory result • Revalidated at booking creation
                  </span>
                </div>

                {data.availableRooms && data.availableRooms.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {data.availableRooms.map((room) => (
                      <div
                        key={room.id}
                        className="p-3 rounded-lg border border-border bg-muted/10 hover:bg-muted/30 transition-colors flex items-center justify-between text-xs"
                      >
                        <div>
                          <p className="font-semibold text-foreground">{room.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            Cap: {room.capacity} • {room.features?.join(', ') || 'Standard'}
                          </p>
                        </div>
                        {onSelectAvailableRoom && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => onSelectAvailableRoom(room.id)}
                            className="h-6 text-[10px] px-2"
                          >
                            Select
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 rounded-lg border border-dashed border-border bg-muted/10 text-center text-xs text-muted-foreground">
                    No rooms are available for the selected time window and capacity requirements.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
