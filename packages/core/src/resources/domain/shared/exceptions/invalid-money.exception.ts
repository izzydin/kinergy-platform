import { ResourcesDomainException } from './resources-domain.exception';

export class InvalidMoneyException extends ResourcesDomainException {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMoneyException';
    Object.setPrototypeOf(this, InvalidMoneyException.prototype);
  }
}
