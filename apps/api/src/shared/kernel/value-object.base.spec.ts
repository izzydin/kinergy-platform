import { ValueObject } from './value-object.base';

interface AddressProps {
  street: string;
  city: string;
  zipCode: string;
}

class Address extends ValueObject<AddressProps> {
  public static create(props: AddressProps): Address {
    return new Address(props);
  }
}

describe('ValueObject Base Class', () => {
  it('should freeze properties upon creation', () => {
    const address = Address.create({ street: '123 Main St', city: 'Metropolis', zipCode: '10001' });
    expect(Object.isFrozen(address.props)).toBe(true);
  });

  it('should return true for structural equality', () => {
    const addr1 = Address.create({ street: '123 Main St', city: 'Metropolis', zipCode: '10001' });
    const addr2 = Address.create({ street: '123 Main St', city: 'Metropolis', zipCode: '10001' });
    expect(addr1.equals(addr2)).toBe(true);
  });

  it('should return false when structural properties differ', () => {
    const addr1 = Address.create({ street: '123 Main St', city: 'Metropolis', zipCode: '10001' });
    const addr2 = Address.create({ street: '456 Elm St', city: 'Metropolis', zipCode: '10001' });
    expect(addr1.equals(addr2)).toBe(false);
  });

  it('should return false when comparing against undefined', () => {
    const addr1 = Address.create({ street: '123 Main St', city: 'Metropolis', zipCode: '10001' });
    expect(addr1.equals(undefined)).toBe(false);
  });
});
