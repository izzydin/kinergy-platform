import { MembershipPlan } from '../plan/membership-plan.aggregate';
import { PlanId } from '../plan/plan-id.vo';
import { PlanCode } from '../plan/plan-code.vo';

export interface MembershipPlanRepository {
  save(plan: MembershipPlan): Promise<void>;
  findById(id: PlanId | string): Promise<MembershipPlan | null>;
  findByCode(code: PlanCode | string): Promise<MembershipPlan | null>;
  findActive(): Promise<MembershipPlan[]>;
  findAll?(): Promise<MembershipPlan[]>;
}
