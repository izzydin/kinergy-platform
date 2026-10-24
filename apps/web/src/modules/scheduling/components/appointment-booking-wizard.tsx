import React, { useState, useMemo } from 'react';
import { Alert, AlertDescription, AlertTitle, Button } from '@kinergy-platform/ui';
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  MapPin,
  Search,
  Stethoscope,
  User,
  Users,
  X,
} from 'lucide-react';
import { useClientList } from '../../client/hooks/use-client-queries';
import {
  useRoomsList,
  useServiceTypes,
  useLiveConflictCheck,
} from '../hooks/use-scheduling-queries';
import { useCreateAppointmentMutation } from '../hooks/use-scheduling-mutations';
import {
  FACILITY_TIMEZONE,
  addMinutesToIso,
  facilityDateTimeToUtcIso,
  formatFacilityDate,
  formatFacilityTime,
  getTodayFacilityDate,
} from '../utils/calendar-date.utils';
import { formatSchedulingErrorMessage } from '../api/scheduling-error';
import type { AppointmentModel } from '../types/scheduling.types';
import type { AppointmentBookingFormData } from '../schemas/appointment-booking.schema';

export interface AppointmentBookingWizardProps {
  isOpen?: boolean;
  onClose?: () => void;
  onSuccess?: (appointment: AppointmentModel) => void;
  initialDate?: string;
  initialRoomId?: string;
  initialTherapistId?: string;
}

const STEPS = [
  { id: 1, label: 'Client' },
  { id: 2, label: 'Service' },
  { id: 3, label: 'Therapist' },
  { id: 4, label: 'Room' },
  { id: 5, label: 'Date & Time' },
  { id: 6, label: 'Review' },
];

const STANDARD_TIMES = [
  '08:00',
  '08:30',
  '09:00',
  '09:30',
  '10:00',
  '10:30',
  '11:00',
  '11:30',
  '12:00',
  '12:30',
  '13:00',
  '13:30',
  '14:00',
  '14:30',
  '15:00',
  '15:30',
  '16:00',
  '16:30',
  '17:00',
  '17:30',
  '18:00',
  '18:30',
  '19:00',
];

export const AppointmentBookingWizard: React.FC<AppointmentBookingWizardProps> = ({
  isOpen = true,
  onClose,
  onSuccess,
  initialDate,
  initialRoomId,
  initialTherapistId,
}) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [clientSearchQuery, setClientSearchQuery] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);
  const [createdAppointment, setCreatedAppointment] = useState<AppointmentModel | null>(null);

  // Form state preserved across steps and conflict retries
  const [formData, setFormData] = useState<AppointmentBookingFormData>({
    clientId: '',
    clientName: '',
    serviceType: '',
    durationMinutes: 60,
    therapistId: initialTherapistId || '',
    roomId: initialRoomId || '',
    date: initialDate || getTodayFacilityDate(),
    time: '10:00',
    notes: '',
  });

  // Queries
  const { data: clientsData, isLoading: isClientsLoading } = useClientList(
    { query: clientSearchQuery || undefined, limit: 8 },
    { enabled: currentStep === 1 },
  );

  const { data: serviceTypes = [], isLoading: isServicesLoading } = useServiceTypes();
  const { data: rooms = [], isLoading: isRoomsLoading } = useRoomsList();

  const createMutation = useCreateAppointmentMutation();

  // Selected Service Type Metadata
  const selectedServiceMeta = useMemo(() => {
    return serviceTypes.find((s) => s.type === formData.serviceType);
  }, [serviceTypes, formData.serviceType]);

  // Selected Room Metadata
  const selectedRoomMeta = useMemo(() => {
    return rooms.find((r) => r.id === formData.roomId);
  }, [rooms, formData.roomId]);

  // Computed UTC Start & End Times
  const { startTimeIso, endTimeIso } = useMemo(() => {
    if (!formData.date || !formData.time) {
      return { startTimeIso: '', endTimeIso: '' };
    }
    const start = facilityDateTimeToUtcIso(formData.date, formData.time);
    const end = addMinutesToIso(start, formData.durationMinutes || 60);
    return { startTimeIso: start, endTimeIso: end };
  }, [formData.date, formData.time, formData.durationMinutes]);

  // Advisory 4D live conflict pre-check
  const { data: conflictCheck } = useLiveConflictCheck(
    {
      therapistId: formData.therapistId,
      roomId: formData.roomId,
      clientId: formData.clientId,
      startTime: startTimeIso,
      endTime: endTimeIso,
      appointmentType: formData.serviceType,
    },
    {
      enabled:
        Boolean(
          formData.therapistId &&
          formData.roomId &&
          formData.clientId &&
          startTimeIso &&
          endTimeIso,
        ) && currentStep >= 5,
    },
  );

  // Step Validation
  const canProceedFromCurrentStep = useMemo(() => {
    switch (currentStep) {
      case 1:
        return Boolean(formData.clientId);
      case 2:
        return Boolean(formData.serviceType);
      case 3:
        return Boolean(formData.therapistId.trim());
      case 4:
        return Boolean(formData.roomId);
      case 5:
        return Boolean(formData.date && formData.time);
      case 6:
        return (
          Boolean(formData.clientId) &&
          Boolean(formData.serviceType) &&
          Boolean(formData.therapistId) &&
          Boolean(formData.roomId) &&
          Boolean(startTimeIso) &&
          Boolean(endTimeIso)
        );
      default:
        return true;
    }
  }, [currentStep, formData, startTimeIso, endTimeIso]);

  if (!isOpen) return null;

  const handleNext = () => {
    if (canProceedFromCurrentStep && currentStep < 6) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  // Submission handler
  const handleConfirmBooking = () => {
    if (!canProceedFromCurrentStep) return;
    setServerError(null);

    createMutation.mutate(
      {
        clientId: formData.clientId,
        type: formData.serviceType,
        therapistId: formData.therapistId.trim(),
        roomId: formData.roomId,
        startTime: startTimeIso,
        endTime: endTimeIso,
        notes: formData.notes?.trim() || undefined,
      },

      {
        onSuccess: (newAppt) => {
          setCreatedAppointment(newAppt);
          onSuccess?.(newAppt);
        },
        onError: (err) => {
          const formatted = formatSchedulingErrorMessage(
            err,
            'Unable to complete booking. The selected slot may conflict with an existing appointment or maintenance window.',
          );
          setServerError(formatted);
          // Stay on review step (or step 5) with all selections preserved so staff can choose another slot
        },
      },
    );
  };

  const handleResetForm = () => {
    setCreatedAppointment(null);
    setServerError(null);
    setCurrentStep(1);
    setFormData({
      clientId: '',
      clientName: '',
      serviceType: '',
      durationMinutes: 60,
      therapistId: initialTherapistId || '',
      roomId: initialRoomId || '',
      date: initialDate || getTodayFacilityDate(),
      time: '10:00',
      notes: '',
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="booking-wizard-title"
    >
      <div className="w-full max-w-2xl bg-background border border-border rounded-xl shadow-2xl overflow-hidden flex flex-col my-8 max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/30">
          <div>
            <h2 id="booking-wizard-title" className="text-lg font-bold text-foreground">
              Book Appointment
            </h2>
            <p className="text-xs text-muted-foreground">
              Facility Timezone: <span className="font-semibold">{FACILITY_TIMEZONE}</span>
            </p>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Close booking wizard"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Step Indicator Navigation */}
        {!createdAppointment && (
          <nav
            aria-label="Booking steps"
            className="flex items-center justify-between border-b border-border px-6 py-2.5 bg-muted/10 overflow-x-auto text-xs"
          >
            {STEPS.map((s) => {
              const isActive = currentStep === s.id;
              const isPassed = currentStep > s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => {
                    if (s.id < currentStep) setCurrentStep(s.id);
                  }}
                  disabled={s.id > currentStep}
                  className={`flex items-center gap-1.5 whitespace-nowrap font-medium transition-colors ${
                    isActive
                      ? 'text-primary font-bold'
                      : isPassed
                        ? 'text-foreground hover:text-primary cursor-pointer'
                        : 'text-muted-foreground opacity-50 cursor-not-allowed'
                  }`}
                  aria-current={isActive ? 'step' : undefined}
                >
                  <span
                    className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : isPassed
                          ? 'bg-emerald-600 text-white'
                          : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {isPassed ? '✓' : s.id}
                  </span>
                  <span>{s.label}</span>
                </button>
              );
            })}
          </nav>
        )}

        {/* Wizard Content Body */}
        <div className="p-6 flex-1 overflow-y-auto space-y-4">
          {/* Server Error Alert (e.g. 409 Conflict) */}
          {serverError && (
            <Alert
              variant="destructive"
              className="border-destructive/40 bg-destructive/10"
              role="alert"
            >
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="font-semibold">Scheduling Conflict / Booking Error</AlertTitle>
              <AlertDescription className="text-xs mt-1">
                {serverError}
                <div className="mt-2 text-foreground font-medium">
                  Your form data has been preserved. Please adjust the selected time slot, room, or
                  therapist and retry.
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* STEP 7: Created Appointment Result */}
          {createdAppointment ? (
            <div className="space-y-4 py-4 text-center">
              <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
                <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-foreground">Appointment Booked!</h3>
                <p className="text-xs text-muted-foreground">
                  The appointment has been registered and scheduled in the platform calendar.
                </p>
              </div>

              <div className="rounded-lg border border-border bg-muted/20 p-4 max-w-md mx-auto text-left text-xs space-y-2">
                <div className="flex justify-between border-b border-border pb-1">
                  <span className="text-muted-foreground">Appointment ID:</span>
                  <span className="font-mono font-medium">{createdAppointment.id}</span>
                </div>
                <div className="flex justify-between border-b border-border pb-1">
                  <span className="text-muted-foreground">Service:</span>
                  <span className="font-semibold">{createdAppointment.type}</span>
                </div>
                <div className="flex justify-between border-b border-border pb-1">
                  <span className="text-muted-foreground">Date & Time:</span>
                  <span>
                    {formatFacilityDate(createdAppointment.startTime)} •{' '}
                    {formatFacilityTime(createdAppointment.startTime)} –{' '}
                    {formatFacilityTime(createdAppointment.endTime)}
                  </span>
                </div>
                <div className="flex justify-between border-b border-border pb-1">
                  <span className="text-muted-foreground">Therapist:</span>
                  <span>{createdAppointment.therapistId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Room:</span>
                  <span>{createdAppointment.roomId}</span>
                </div>
              </div>

              <div className="flex items-center justify-center gap-3 pt-4">
                <Button size="sm" onClick={handleResetForm} variant="outline">
                  Book Another Appointment
                </Button>
                {onClose && (
                  <Button size="sm" onClick={onClose} variant="default">
                    Return to Calendar
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* STEP 1: Client Selection */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">1. Select Client</h3>
                    <p className="text-xs text-muted-foreground">
                      Search for an active client profile by name, phone, or email.
                    </p>
                  </div>

                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search clients by name, email, or phone..."
                      value={clientSearchQuery}
                      onChange={(e) => setClientSearchQuery(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 text-xs rounded-md border border-input bg-background shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                      autoFocus
                    />
                  </div>

                  {/* Selected Client pill */}
                  {formData.clientId && (
                    <div className="p-2.5 rounded-lg border border-primary/40 bg-primary/5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-primary" />
                        <div>
                          <p className="font-semibold text-foreground">
                            {formData.clientName || formData.clientId}
                          </p>
                          <p className="text-[10px] text-muted-foreground">
                            Client ID: {formData.clientId}
                          </p>
                        </div>
                      </div>
                      <span className="text-xs text-emerald-600 font-semibold">Selected ✓</span>
                    </div>
                  )}

                  {/* Search Results List */}
                  <div className="space-y-1.5 max-h-60 overflow-y-auto">
                    {isClientsLoading && (
                      <p className="text-xs text-muted-foreground p-3 text-center">
                        Searching clients...
                      </p>
                    )}
                    {(() => {
                      const clientList = clientsData?.items ?? [];
                      if (!isClientsLoading && clientList.length === 0 && clientSearchQuery) {
                        return (
                          <p className="text-xs text-muted-foreground p-3 text-center">
                            No matching clients found for &quot;{clientSearchQuery}&quot;.
                          </p>
                        );
                      }
                      return clientList.map((client) => {
                        const isSelected = formData.clientId === client.id;
                        const fullName = `${client.firstName} ${client.lastName}`;
                        return (
                          <div
                            key={client.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setFormData((prev) => ({
                                ...prev,
                                clientId: client.id,
                                clientName: fullName,
                              }));
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                setFormData((prev) => ({
                                  ...prev,
                                  clientId: client.id,
                                  clientName: fullName,
                                }));
                              }
                            }}
                            className={`p-2.5 rounded-md border text-left cursor-pointer transition-colors flex items-center justify-between ${
                              isSelected
                                ? 'border-primary bg-primary/10'
                                : 'border-border hover:bg-muted/30'
                            }`}
                          >
                            <div>
                              <p className="text-xs font-semibold text-foreground">{fullName}</p>
                              <p className="text-[11px] text-muted-foreground">
                                {client.email} • {client.phone}
                              </p>
                            </div>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted font-medium">
                              {client.status}
                            </span>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>
              )}

              {/* STEP 2: Service Selection */}
              {currentStep === 2 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      2. Choose Service Type
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Select a bookable treatment or consultation type with authoritative duration.
                    </p>
                  </div>

                  {isServicesLoading && (
                    <p className="text-xs text-muted-foreground p-4 text-center">
                      Loading service types catalog...
                    </p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {serviceTypes.map((service) => {
                      const isSelected = formData.serviceType === service.type;
                      return (
                        <div
                          key={service.type}
                          role="button"
                          tabIndex={0}
                          onClick={() => {
                            setFormData((prev) => ({
                              ...prev,
                              serviceType: service.type,
                              durationMinutes: service.standardDurationMinutes,
                            }));
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              setFormData((prev) => ({
                                ...prev,
                                serviceType: service.type,
                                durationMinutes: service.standardDurationMinutes,
                              }));
                            }
                          }}
                          className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                            isSelected
                              ? 'border-primary bg-primary/10 ring-1 ring-primary'
                              : 'border-border hover:bg-muted/30'
                          }`}
                        >
                          <p className="text-xs font-bold text-foreground">{service.label}</p>
                          <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-1">
                            <Clock className="h-3 w-3" />
                            <span>Standard: {service.standardDurationMinutes} mins</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Allowed range: {service.minDurationMinutes}–{service.maxDurationMinutes}{' '}
                            mins
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 3: Therapist Selection */}
              {currentStep === 3 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">3. Select Therapist</h3>
                    <p className="text-xs text-muted-foreground">
                      Specify the practitioner or therapist who will conduct the session.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label
                      htmlFor="input-therapist-id"
                      className="text-xs font-medium text-foreground flex items-center gap-1.5"
                    >
                      <Stethoscope className="h-3.5 w-3.5 text-primary" />
                      <span>Therapist Identifier / Practitioner Code:</span>
                    </label>
                    <input
                      id="input-therapist-id"
                      type="text"
                      placeholder="e.g. dr_smith, therapist_sarah, pt_alex"
                      value={formData.therapistId}
                      onChange={(e) =>
                        setFormData((prev) => ({ ...prev, therapistId: e.target.value }))
                      }
                      className="w-full px-3 py-2 text-xs rounded-md border border-input bg-background shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                      autoFocus
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Availability queries and conflict detection will validate against this
                      therapist&apos;s schedule.
                    </p>
                  </div>
                </div>
              )}

              {/* STEP 4: Room Selection */}
              {currentStep === 4 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">4. Select Room</h3>
                    <p className="text-xs text-muted-foreground">
                      Choose an available facility room suitable for the session.
                    </p>
                  </div>

                  {isRoomsLoading && (
                    <p className="text-xs text-muted-foreground p-4 text-center">
                      Loading registered rooms...
                    </p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {rooms.map((room) => {
                      const isSelected = formData.roomId === room.id;
                      const isAvailable = room.status === 'AVAILABLE';

                      return (
                        <div
                          key={room.id}
                          role="button"
                          tabIndex={isAvailable ? 0 : -1}
                          onClick={() => {
                            if (isAvailable) {
                              setFormData((prev) => ({ ...prev, roomId: room.id }));
                            }
                          }}
                          onKeyDown={(e) => {
                            if (isAvailable && (e.key === 'Enter' || e.key === ' ')) {
                              setFormData((prev) => ({ ...prev, roomId: room.id }));
                            }
                          }}
                          className={`p-3 rounded-lg border text-left transition-all ${
                            !isAvailable
                              ? 'opacity-50 cursor-not-allowed bg-muted/20 border-border'
                              : isSelected
                                ? 'border-primary bg-primary/10 ring-1 ring-primary cursor-pointer'
                                : 'border-border hover:bg-muted/30 cursor-pointer'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-bold text-foreground">{room.name}</p>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                isAvailable
                                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                  : 'bg-rose-500/15 text-rose-700 dark:text-rose-400'
                              }`}
                            >
                              {room.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
                            <Users className="h-3 w-3" />
                            <span>Capacity: {room.capacity}</span>
                          </div>
                          {room.features && room.features.length > 0 && (
                            <p className="text-[10px] text-muted-foreground mt-1 truncate">
                              Features: {room.features.join(', ')}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* STEP 5: Date & Time Selection */}
              {currentStep === 5 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">5. Date & Time</h3>
                    <p className="text-xs text-muted-foreground">
                      Pick the appointment date and facility-local operational start time (
                      {FACILITY_TIMEZONE}).
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Date Picker */}
                    <div className="space-y-1.5">
                      <label htmlFor="input-date" className="text-xs font-medium text-foreground">
                        Date:
                      </label>
                      <input
                        id="input-date"
                        type="date"
                        value={formData.date}
                        onChange={(e) => setFormData((prev) => ({ ...prev, date: e.target.value }))}
                        className="w-full px-3 py-2 text-xs rounded-md border border-input bg-background shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                      />
                    </div>

                    {/* Duration Display */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-foreground">Duration:</label>
                      <div className="px-3 py-2 text-xs rounded-md border border-input bg-muted/30 font-medium">
                        {formData.durationMinutes} minutes (Standard for{' '}
                        {selectedServiceMeta?.label || formData.serviceType})
                      </div>
                    </div>
                  </div>

                  {/* Standard Time Slots Grid */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-foreground">
                      Facility Start Time:
                    </label>
                    <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-48 overflow-y-auto p-1 border border-border rounded-md bg-muted/10">
                      {STANDARD_TIMES.map((timeStr) => {
                        const isSelected = formData.time === timeStr;
                        return (
                          <button
                            key={timeStr}
                            type="button"
                            onClick={() => setFormData((prev) => ({ ...prev, time: timeStr }))}
                            className={`py-1.5 text-xs font-medium rounded-md transition-colors ${
                              isSelected
                                ? 'bg-primary text-primary-foreground font-bold shadow-xs'
                                : 'bg-background hover:bg-muted text-foreground border border-input'
                            }`}
                          >
                            {timeStr}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Computed Interval Preview */}
                  {startTimeIso && endTimeIso && (
                    <div className="p-3 rounded-lg border border-border bg-muted/20 text-xs flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-primary" />
                        <span>
                          {formatFacilityDate(startTimeIso)} • {formatFacilityTime(startTimeIso)} –{' '}
                          {formatFacilityTime(endTimeIso)}
                        </span>
                      </div>
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        {FACILITY_TIMEZONE}
                      </span>
                    </div>
                  )}

                  {/* Live Advisory Conflict Warning */}
                  {conflictCheck?.hasConflict && (
                    <div
                      className="p-3 rounded-lg border border-red-300 bg-red-50 text-red-900 dark:bg-red-950/40 dark:border-red-800 dark:text-red-200 text-xs flex items-start gap-2"
                      role="alert"
                    >
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                      <div>
                        <p className="font-semibold">Conflict Pre-Check Warning</p>
                        <p className="mt-0.5">
                          {conflictCheck.conflicts.map((c) => c.reason).join(' ') ||
                            'The selected time slot overlaps with an existing booking or therapist commitment.'}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* STEP 6: Review & Confirm */}
              {currentStep === 6 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      6. Review &amp; Confirm Booking
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Verify all operational booking details before final confirmation.
                    </p>
                  </div>

                  <div className="rounded-lg border border-border divide-y divide-border text-xs bg-card">
                    <div className="p-3 flex justify-between items-center">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <User className="h-3.5 w-3.5 text-primary" />
                        <span>Client:</span>
                      </span>
                      <span className="font-semibold text-foreground">
                        {formData.clientName || formData.clientId}
                      </span>
                    </div>

                    <div className="p-3 flex justify-between items-center">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-primary" />
                        <span>Service:</span>
                      </span>
                      <span className="font-semibold text-foreground">
                        {selectedServiceMeta?.label || formData.serviceType} (
                        {formData.durationMinutes} mins)
                      </span>
                    </div>

                    <div className="p-3 flex justify-between items-center">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Stethoscope className="h-3.5 w-3.5 text-primary" />
                        <span>Therapist:</span>
                      </span>
                      <span className="font-semibold text-foreground">{formData.therapistId}</span>
                    </div>

                    <div className="p-3 flex justify-between items-center">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 text-primary" />
                        <span>Room:</span>
                      </span>
                      <span className="font-semibold text-foreground">
                        {selectedRoomMeta?.name || formData.roomId}
                      </span>
                    </div>

                    <div className="p-3 flex justify-between items-center">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-primary" />
                        <span>Scheduled Interval:</span>
                      </span>
                      <span className="font-semibold text-foreground">
                        {formatFacilityDate(startTimeIso)} • {formatFacilityTime(startTimeIso)} –{' '}
                        {formatFacilityTime(endTimeIso)} ({FACILITY_TIMEZONE})
                      </span>
                    </div>
                  </div>

                  {/* Optional Notes */}
                  <div className="space-y-1.5">
                    <label htmlFor="input-notes" className="text-xs font-medium text-foreground">
                      Session / Intake Notes (Optional):
                    </label>
                    <textarea
                      id="input-notes"
                      rows={3}
                      placeholder="Special instructions, intake symptoms, or referral notes..."
                      value={formData.notes || ''}
                      onChange={(e) => setFormData((prev) => ({ ...prev, notes: e.target.value }))}
                      className="w-full px-3 py-2 text-xs rounded-md border border-input bg-background shadow-xs focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer Navigation Buttons */}
        {!createdAppointment && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/20">
            <div>
              {currentStep > 1 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handlePrev}
                  disabled={createMutation.isPending}
                  className="inline-flex items-center gap-1"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Previous</span>
                </Button>
              )}
            </div>

            <div className="flex items-center gap-2">
              {onClose && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onClose}
                  disabled={createMutation.isPending}
                >
                  Cancel
                </Button>
              )}

              {currentStep < 6 ? (
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleNext}
                  disabled={!canProceedFromCurrentStep}
                  className="inline-flex items-center gap-1"
                >
                  <span>Next</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="default"
                  onClick={handleConfirmBooking}
                  disabled={!canProceedFromCurrentStep || createMutation.isPending}
                  className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
                >
                  {createMutation.isPending ? (
                    <>
                      <span className="h-3.5 w-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      <span>Booking...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Confirm &amp; Book</span>
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
