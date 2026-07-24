import { AggregateRoot } from './aggregate-root.base';
import { IDomainEvent } from './domain-event.interface';

class SampleDomainEvent implements IDomainEvent {
  public readonly dateTimeOccurred: Date = new Date();
  constructor(private readonly aggregateId: string) {}

  getAggregateId(): string {
    return this.aggregateId;
  }
}

interface TestAggregateProps {
  title: string;
}

class TestAggregate extends AggregateRoot<TestAggregateProps> {
  public static create(props: TestAggregateProps, id?: string): TestAggregate {
    const aggregate = new TestAggregate(props, id);
    aggregate.addDomainEvent(new SampleDomainEvent(aggregate.id));
    return aggregate;
  }
}

describe('AggregateRoot Base Class', () => {
  it('should register domain events when created', () => {
    const aggregate = TestAggregate.create({ title: 'Test Aggregate' });
    expect(aggregate.domainEvents).toHaveLength(1);
    expect(aggregate.domainEvents[0]?.getAggregateId()).toBe(aggregate.id);
  });

  it('should clear domain events when clearEvents is called', () => {
    const aggregate = TestAggregate.create({ title: 'Test Aggregate' });
    expect(aggregate.domainEvents).toHaveLength(1);

    aggregate.clearEvents();
    expect(aggregate.domainEvents).toHaveLength(0);
  });
});
