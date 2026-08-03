import { ValueObject } from '../../shared/value-object';

export interface AppointmentNoteProps {
  readonly id: string;
  readonly noteText: string;
  readonly authorId: string;
  readonly createdAt: Date;
}

/**
 * Immutable Value Object representing a clinical or administrative note appended to an Appointment.
 */
export class AppointmentNote implements ValueObject<AppointmentNoteProps> {
  private readonly props: AppointmentNoteProps;

  private constructor(props: AppointmentNoteProps) {
    if (!props.id || props.id.trim().length === 0) {
      throw new Error('Appointment note ID cannot be empty.');
    }
    if (!props.noteText || props.noteText.trim().length === 0) {
      throw new Error('Appointment note text cannot be empty.');
    }
    if (!props.authorId || props.authorId.trim().length === 0) {
      throw new Error('Author ID cannot be empty.');
    }
    if (!props.createdAt) {
      throw new Error('Creation timestamp is required for appointment note.');
    }

    this.props = {
      id: props.id.trim(),
      noteText: props.noteText.trim(),
      authorId: props.authorId.trim(),
      createdAt: new Date(props.createdAt.getTime()),
    };
    Object.freeze(this);
  }

  /**
   * Factory method to construct an AppointmentNote.
   *
   * @param authorId Scalar ID of the user authoring the note
   * @param noteText Text content of the note
   * @param createdAt Date timestamp of creation
   * @param id Optional explicit note ID
   */
  public static create(
    authorId: string,
    noteText: string,
    createdAt: Date = new Date(),
    id?: string,
  ): AppointmentNote {
    const noteId = id ?? `note_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    return new AppointmentNote({
      id: noteId,
      authorId,
      noteText,
      createdAt,
    });
  }

  /** Gets the note ID string */
  public get id(): string {
    return this.props.id;
  }

  /** Gets the text content of the note */
  public get noteText(): string {
    return this.props.noteText;
  }

  /** Gets the author's user ID */
  public get authorId(): string {
    return this.props.authorId;
  }

  /** Gets a defensive copy of the creation Date */
  public get createdAt(): Date {
    return new Date(this.props.createdAt.getTime());
  }

  public getValue(): AppointmentNoteProps {
    return {
      id: this.props.id,
      noteText: this.props.noteText,
      authorId: this.props.authorId,
      createdAt: new Date(this.props.createdAt.getTime()),
    };
  }

  public equals(other: ValueObject<AppointmentNoteProps>): boolean {
    if (!other || !(other instanceof AppointmentNote)) {
      return false;
    }
    return this.props.id === other.getValue().id;
  }
}
