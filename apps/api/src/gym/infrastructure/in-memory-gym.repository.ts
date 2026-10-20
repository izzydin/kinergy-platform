import {
  MembershipRepository,
  MembershipPlanRepository,
  AttendanceRecordRepository,
  Membership,
  MembershipPlan,
  AttendanceRecord,
  PlanStatus,
} from '@kinergy-platform/core';

/**
 * In-memory repository fallback implementations for deterministic, isolated unit/E2E testing.
 * Retained per ADR-0080 guidelines for non-database-backed environments and test doubles.
 */
export class DefaultGymMembershipRepository implements MembershipRepository {
  private readonly items = new Map<string, Membership>();

  async save(membership: Membership): Promise<void> {
    this.items.set(membership.id.value, membership);
  }

  async findById(id: string): Promise<Membership | null> {
    return this.items.get(id) ?? null;
  }

  async findByClientId(clientId: string): Promise<Membership[]> {
    return Array.from(this.items.values()).filter((m) => m.clientId === clientId);
  }

  async findByTrainerId(trainerId: string): Promise<Membership[]> {
    return Array.from(this.items.values()).filter(
      (m) => m.trainerAssignment?.trainerId === trainerId,
    );
  }

  async findExpiringCandidates(asOfDate: Date): Promise<Membership[]> {
    return Array.from(this.items.values()).filter((m) => m.period.endDate <= asOfDate);
  }

  async findExpiringWithinHorizon(asOfDate: Date, horizonDays: number): Promise<Membership[]> {
    const horizonMs = horizonDays * 24 * 60 * 60 * 1000;
    return Array.from(this.items.values()).filter((m) => {
      const diffMs = m.period.endDate.getTime() - asOfDate.getTime();
      return diffMs > 0 && diffMs <= horizonMs;
    });
  }

  async findAll(): Promise<Membership[]> {
    return Array.from(this.items.values());
  }

  clear(): void {
    this.items.clear();
  }
}

export class DefaultGymPlanRepository implements MembershipPlanRepository {
  private readonly items = new Map<string, MembershipPlan>();

  async save(plan: MembershipPlan): Promise<void> {
    this.items.set(plan.id.value, plan);
  }

  async findById(id: string): Promise<MembershipPlan | null> {
    return this.items.get(id) ?? null;
  }

  async findByCode(code: string): Promise<MembershipPlan | null> {
    return Array.from(this.items.values()).find((p) => p.code.value === code) ?? null;
  }

  async findActive(): Promise<MembershipPlan[]> {
    return Array.from(this.items.values()).filter((p) => p.status === PlanStatus.ACTIVE);
  }

  async findAll(): Promise<MembershipPlan[]> {
    return Array.from(this.items.values());
  }

  clear(): void {
    this.items.clear();
  }
}

export class DefaultGymAttendanceRepository implements AttendanceRecordRepository {
  private readonly items: AttendanceRecord[] = [];

  async append(record: AttendanceRecord): Promise<void> {
    this.items.push(record);
  }

  async findById(id: string): Promise<AttendanceRecord | null> {
    return this.items.find((r) => r.id.value === id) ?? null;
  }

  async findByClientId(clientId: string, limit?: number): Promise<AttendanceRecord[]> {
    const list = this.items.filter((r) => r.clientId === clientId);
    return limit ? list.slice(0, limit) : list;
  }

  async findRecentByClientId(clientId: string, since: Date): Promise<AttendanceRecord[]> {
    return this.items.filter((r) => r.clientId === clientId && r.checkInTime >= since);
  }

  async findByGymDay(gymDay: string): Promise<AttendanceRecord[]> {
    return this.items.filter((r) => r.gymDay.toString() === gymDay);
  }

  async countGrantedByGymDay(gymDay: string): Promise<number> {
    return this.items.filter((r) => r.gymDay.toString() === gymDay && r.isGranted).length;
  }

  async countGrantedByClientAndGymDay(clientId: string, gymDay: string): Promise<number> {
    return this.items.filter(
      (r) => r.clientId === clientId && r.gymDay.toString() === gymDay && r.isGranted,
    ).length;
  }

  clear(): void {
    this.items.length = 0;
  }
}

// Aliases for explicit testing semantics
export {
  DefaultGymMembershipRepository as InMemoryGymMembershipRepository,
  DefaultGymPlanRepository as InMemoryGymPlanRepository,
  DefaultGymAttendanceRepository as InMemoryGymAttendanceRepository,
};
