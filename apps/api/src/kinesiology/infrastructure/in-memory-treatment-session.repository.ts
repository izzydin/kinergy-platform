import {
  ITreatmentSessionRepository,
  TreatmentHistoryFilter,
  TreatmentSession,
  SessionId,
  TreatmentHistorySummaryDTO,
  PaginatedTreatmentHistoryDTO,
} from '@kinergy-platform/core';

/**
 * In-memory repository implementation of ITreatmentSessionRepository.
 * Useful for fast standalone execution, mock environments, and integration tests.
 */
export class InMemoryTreatmentSessionRepository implements ITreatmentSessionRepository {
  private readonly items = new Map<string, TreatmentSession>();

  public async findById(id: SessionId): Promise<TreatmentSession | null> {
    return this.items.get(id.getValue()) ?? null;
  }

  public async findByAppointmentId(appointmentId: string): Promise<TreatmentSession | null> {
    for (const session of this.items.values()) {
      if (session.appointmentId === appointmentId) {
        return session;
      }
    }
    return null;
  }

  public async save(session: TreatmentSession): Promise<void> {
    this.items.set(session.id.getValue(), session);
  }

  public async findHistoryByClientId(
    clientId: string,
    filter: TreatmentHistoryFilter,
  ): Promise<PaginatedTreatmentHistoryDTO> {
    let sessions = Array.from(this.items.values()).filter((s) => s.clientId === clientId);

    if (filter.status) {
      sessions = sessions.filter((s) => s.status === filter.status);
    }

    if (filter.therapistId) {
      sessions = sessions.filter((s) => s.therapistId === filter.therapistId);
    }

    if (filter.dateFrom) {
      sessions = sessions.filter((s) => s.createdAt >= filter.dateFrom!);
    }

    if (filter.dateTo) {
      sessions = sessions.filter((s) => s.createdAt <= filter.dateTo!);
    }

    // Sort descending by createdAt
    sessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = sessions.length;
    const page = Math.max(1, filter.pagination.page);
    const limit = Math.max(1, Math.min(50, filter.pagination.limit));
    const skip = (page - 1) * limit;
    const paged = sessions.slice(skip, skip + limit);
    const totalPages = Math.ceil(total / limit) || 1;

    const items: TreatmentHistorySummaryDTO[] = paged.map((s) => {
      const notes = s.notes;
      const hasFullNotes = notes.hasContent();
      const notesSummary =
        notes.getAssessment() || notes.getSubjective() || notes.getRawText() || undefined;

      return {
        sessionId: s.id.getValue(),
        clientId: s.clientId,
        appointmentId: s.appointmentId,
        therapistId: s.therapistId,
        status: s.status,
        notesSummary: notesSummary ? notesSummary.slice(0, 150) : undefined,
        hasFullNotes,
        version: s.version,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      };
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  public clear(): void {
    this.items.clear();
  }
}
