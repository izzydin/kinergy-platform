/**
 * Generic Base Class for Test Entity Factories.
 */
export abstract class TestFactoryBase<TProps, TEntity> {
  protected sequenceCounter = 1;

  /**
   * Generates default props for test object instantiation.
   */
  protected abstract getDefaultProps(): TProps;

  /**
   * Builds domain entity instance from resolved props.
   */
  protected abstract buildEntity(props: TProps): TEntity;

  /**
   * Builds single entity instance with optional prop overrides.
   */
  public create(overrides?: Partial<TProps>): TEntity {
    const props = {
      ...this.getDefaultProps(),
      ...overrides,
    };
    this.sequenceCounter++;
    return this.buildEntity(props);
  }

  /**
   * Builds multiple entity instances with optional prop overrides.
   */
  public createMany(count: number, overrides?: Partial<TProps>): TEntity[] {
    const items: TEntity[] = [];
    for (let i = 0; i < count; i++) {
      items.push(this.create(overrides));
    }
    return items;
  }
}
