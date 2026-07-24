export interface IBoundedContext {
  readonly contextName: string;
  initialize(): Promise<void>;
}
