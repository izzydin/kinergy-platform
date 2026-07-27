import { TestFactoryBase } from './test-factory.base';

export interface RoleTestFactoryProps {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}

export class RoleTestFactory extends TestFactoryBase<RoleTestFactoryProps, RoleTestFactoryProps> {
  protected getDefaultProps(): RoleTestFactoryProps {
    const seq = this.sequenceCounter;
    return {
      id: `role_test_${seq}`,
      name: `ROLE_TEST_${seq}`,
      description: `Test Role ${seq}`,
      permissions: ['read:own'],
    };
  }

  protected buildEntity(props: RoleTestFactoryProps): RoleTestFactoryProps {
    return props;
  }
}
