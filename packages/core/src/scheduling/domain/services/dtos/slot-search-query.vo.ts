import { Duration } from '../../value-objects/duration.vo';
import { AppointmentType } from '../../value-objects/appointment-type.vo';

/** Parameters for single resource slot search */
export interface SlotSearchQueryProps {
  readonly therapistId: string;
  readonly roomId: string;
  readonly clientId?: string;
  readonly duration: Duration;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly appointmentType?: AppointmentType;
  readonly stepIntervalMinutes?: number;
}

/** Value Object representing single therapist & room slot search query */
export class SlotSearchQuery {
  public readonly therapistId: string;
  public readonly roomId: string;
  public readonly clientId?: string;
  public readonly duration: Duration;
  public readonly startDate: Date;
  public readonly endDate: Date;
  public readonly appointmentType?: AppointmentType;
  public readonly stepIntervalMinutes: number;

  constructor(props: SlotSearchQueryProps) {
    if (!props.therapistId || props.therapistId.trim().length === 0) {
      throw new Error('Therapist ID is required.');
    }
    if (!props.roomId || props.roomId.trim().length === 0) {
      throw new Error('Room ID is required.');
    }
    if (!props.duration) {
      throw new Error('Duration is required.');
    }
    if (
      !props.startDate ||
      !props.endDate ||
      props.startDate.getTime() >= props.endDate.getTime()
    ) {
      throw new Error('Valid search time range (startDate < endDate) is required.');
    }

    this.therapistId = props.therapistId.trim();
    this.roomId = props.roomId.trim();
    this.clientId = props.clientId ? props.clientId.trim() : undefined;
    this.duration = props.duration;
    this.startDate = new Date(props.startDate.getTime());
    this.endDate = new Date(props.endDate.getTime());
    this.appointmentType = props.appointmentType;
    this.stepIntervalMinutes = props.stepIntervalMinutes ?? 15;
    Object.freeze(this);
  }
}

/** Parameters for multi-resource matrix combination slot search */
export interface MultiResourceSlotSearchQueryProps {
  readonly therapistIds?: string[];
  readonly roomIds?: string[];
  readonly requiredFeatures?: string[];
  readonly requiredCapacity?: number;
  readonly clientId?: string;
  readonly duration: Duration;
  readonly startDate: Date;
  readonly endDate: Date;
  readonly appointmentType?: AppointmentType;
  readonly stepIntervalMinutes?: number;
}

/** Value Object representing flexible multi-resource combination slot search query */
export class MultiResourceSlotSearchQuery {
  public readonly therapistIds?: string[];
  public readonly roomIds?: string[];
  public readonly requiredFeatures?: string[];
  public readonly requiredCapacity?: number;
  public readonly clientId?: string;
  public readonly duration: Duration;
  public readonly startDate: Date;
  public readonly endDate: Date;
  public readonly appointmentType?: AppointmentType;
  public readonly stepIntervalMinutes: number;

  constructor(props: MultiResourceSlotSearchQueryProps) {
    if (!props.duration) {
      throw new Error('Duration is required.');
    }
    if (
      !props.startDate ||
      !props.endDate ||
      props.startDate.getTime() >= props.endDate.getTime()
    ) {
      throw new Error('Valid search time range (startDate < endDate) is required.');
    }

    this.therapistIds = props.therapistIds;
    this.roomIds = props.roomIds;
    this.requiredFeatures = props.requiredFeatures;
    this.requiredCapacity = props.requiredCapacity;
    this.clientId = props.clientId ? props.clientId.trim() : undefined;
    this.duration = props.duration;
    this.startDate = new Date(props.startDate.getTime());
    this.endDate = new Date(props.endDate.getTime());
    this.appointmentType = props.appointmentType;
    this.stepIntervalMinutes = props.stepIntervalMinutes ?? 15;
    Object.freeze(this);
  }
}
