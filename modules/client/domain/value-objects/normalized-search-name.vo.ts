import { ValueObject } from '../kernel';
import { ClientName } from './client-name.vo';

export interface NormalizedSearchNameProps {
  value: string;
}

export class NormalizedSearchName extends ValueObject<NormalizedSearchNameProps> {
  private constructor(props: NormalizedSearchNameProps) {
    super(props);
  }

  public get value(): string {
    return this.props.value;
  }

  public static create(input: string | ClientName): NormalizedSearchName {
    const text = typeof input === 'string' ? input : input.fullName;
    const normalized = this.normalize(text);
    return new NormalizedSearchName({ value: normalized });
  }

  public static normalize(text: string): string {
    return (text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ');
  }
}
