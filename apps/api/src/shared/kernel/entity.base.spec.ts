import { Entity } from './entity.base';

interface TestEntityProps {
  name: string;
}

class TestEntity extends Entity<TestEntityProps> {
  public static create(props: TestEntityProps, id?: string): TestEntity {
    return new TestEntity(props, id);
  }
}

describe('Entity Base Class', () => {
  it('should generate a valid UUID if no id is provided', () => {
    const entity = TestEntity.create({ name: 'Test' });
    expect(entity.id).toBeDefined();
    expect(typeof entity.id).toBe('string');
    expect(entity.props.name).toBe('Test');
  });

  it('should use provided id when explicitly specified', () => {
    const customId = 'custom-entity-id-123';
    const entity = TestEntity.create({ name: 'Test' }, customId);
    expect(entity.id).toBe(customId);
  });

  it('should return true when comparing entities with the same id', () => {
    const id = 'shared-id';
    const entity1 = TestEntity.create({ name: 'Alpha' }, id);
    const entity2 = TestEntity.create({ name: 'Beta' }, id);
    expect(entity1.equals(entity2)).toBe(true);
  });

  it('should return false when comparing entities with different ids', () => {
    const entity1 = TestEntity.create({ name: 'Alpha' }, 'id-1');
    const entity2 = TestEntity.create({ name: 'Alpha' }, 'id-2');
    expect(entity1.equals(entity2)).toBe(false);
  });

  it('should return false when comparing against null or undefined', () => {
    const entity = TestEntity.create({ name: 'Alpha' }, 'id-1');
    expect(entity.equals(undefined)).toBe(false);
  });
});
