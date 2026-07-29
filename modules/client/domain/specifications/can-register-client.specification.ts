import { RegisterClientProps } from '../aggregates/client.aggregate';

export class CanRegisterClientSpecification {
  public isSatisfiedBy(props: RegisterClientProps): boolean {
    if (!props) {
      return false;
    }

    if (!props.referenceNumber || !props.referenceNumber.value) {
      return false;
    }

    if (!props.name || !props.name.firstName || !props.name.lastName) {
      return false;
    }

    if (!props.email || !props.email.value) {
      return false;
    }

    if (!props.phone || !props.phone.value) {
      return false;
    }

    return true;
  }
}
