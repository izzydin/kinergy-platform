import { ValueObject } from '../kernel';

export interface ClientIdProps {
  value: string;
}

export class ClientId extends ValueObject<ClientIdProps> {
  private static readonly UUID_REGEX =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  private constructor(props: ClientIdProps) {
    super(props);
  }

  public get value(): string {
    return this.props.value;
  }

  public static create(id?: string): ClientId {
    if (id) {
      const trimmed = id.trim();
      if (!this.isValid(trimmed)) {
        throw new Error(`Invalid ClientId: '${id}' is not a valid UUID format.`);
      }
      return new ClientId({ value: trimmed });
    }
    return new ClientId({ value: crypto.randomUUID() });
  }

  public static isValid(id: string): boolean {
    return this.UUID_REGEX.test(id);
  }
}
