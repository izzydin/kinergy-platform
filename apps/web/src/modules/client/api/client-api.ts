import { httpClient } from '../../../shared/api/http-client';
import type {
  ClientModel,
  ClientSortField,
  ClientSortDirectionUpper,
  LinkIdentityInputDTO,
  PaginatedClientsDTO,
  RegisterClientInputDTO,
  RegisterClientResponseDTO,
  SearchClientsQueryParams,
  UpdateClientInputDTO,
} from '../types/client.types';
import type { ClientTimelineParams, PaginatedClientTimeline } from '../types/client-timeline.types';

/**
 * Standardized Client Management API Client Adapter
 *
 * Encapsulates all transport interactions with the backend ClientController (/api/v1/clients):
 * - Search & List: GET /api/v1/clients
 * - Retrieve Profile: GET /api/v1/clients/:id
 * - Register: POST /api/v1/clients
 * - Update: PATCH /api/v1/clients/:id
 * - Archive: PATCH /api/v1/clients/:id/archive
 * - Restore: PATCH /api/v1/clients/:id/restore
 * - Link Identity: POST /api/v1/clients/:id/link-identity
 * - Longitudinal Activity Timeline: GET /api/v1/clients/:id/timeline
 */
export const clientApi = {
  /**
   * Searches and lists client profiles with server-side pagination, sorting, and filters.
   */
  async searchClients(params?: SearchClientsQueryParams): Promise<PaginatedClientsDTO> {
    // Determine sort field and direction from explicit params or compound sort string (e.g. "createdAt.desc")
    let sortBy: ClientSortField | undefined = params?.sortBy;
    let sortOrder: ClientSortDirectionUpper | undefined = params?.sortOrder;

    if (!sortBy && params?.sort) {
      const parts = params.sort.split('.');
      const candidateField = parts[0] as ClientSortField;
      if (['name', 'createdAt', 'updatedAt'].includes(candidateField)) {
        sortBy = candidateField;
      }
      if (parts[1]?.toUpperCase() === 'ASC' || parts[1]?.toUpperCase() === 'DESC') {
        sortOrder = parts[1].toUpperCase() as ClientSortDirectionUpper;
      }
    }

    const queryText = (params?.query ?? params?.q ?? '').trim();

    return httpClient.get<PaginatedClientsDTO>('/api/v1/clients', {
      params: {
        query: queryText ? queryText : undefined,
        status: params?.status,
        includeArchived: params?.includeArchived,
        createdFrom: params?.createdFrom,
        createdTo: params?.createdTo,
        sortBy,
        sortOrder,
        page: params?.page,
        limit: params?.limit,
      },
    });
  },

  /**
   * Retrieves single client profile by UUID identifier.
   */
  async getClientProfile(id: string): Promise<ClientModel> {
    const encodedId = encodeURIComponent((id || '').trim());
    return httpClient.get<ClientModel>(`/api/v1/clients/${encodedId}`);
  },

  /**
   * Registers a new client profile.
   * Throws 409 with PotentialMatchesResponseDto if soft duplicates are detected.
   */
  async registerClient(payload: RegisterClientInputDTO): Promise<RegisterClientResponseDTO> {
    return httpClient.post<RegisterClientResponseDTO>('/api/v1/clients', {
      firstName: payload.firstName.trim(),
      lastName: payload.lastName.trim(),
      email: payload.email.trim(),
      phone: payload.phone.trim(),
      identityId: payload.identityId?.trim() || undefined,
      bypassSoftDuplicates: payload.bypassSoftDuplicates ?? false,
    });
  },

  /**
   * Updates existing client details with optimistic concurrency protection (If-Match header).
   */
  async updateClient(id: string, payload: UpdateClientInputDTO): Promise<ClientModel> {
    const encodedId = encodeURIComponent((id || '').trim());
    return httpClient.patch<ClientModel>(
      `/api/v1/clients/${encodedId}`,
      {
        expectedVersion: payload.expectedVersion,
        firstName: payload.firstName?.trim(),
        lastName: payload.lastName?.trim(),
        email: payload.email?.trim(),
        phone: payload.phone?.trim(),
      },
      {
        headers: {
          'If-Match': `"${payload.expectedVersion}"`,
        },
      },
    );
  },

  /**
   * Archives a client profile. Requires ADMIN or STAFF role.
   */
  async archiveClient(id: string, expectedVersion?: number): Promise<ClientModel> {
    const encodedId = encodeURIComponent((id || '').trim());
    const headers: Record<string, string> = {};
    if (expectedVersion !== undefined) {
      headers['If-Match'] = `"${expectedVersion}"`;
    }

    return httpClient.patch<ClientModel>(`/api/v1/clients/${encodedId}/archive`, {}, { headers });
  },

  /**
   * Restores an archived client profile back to ACTIVE status. Requires ADMIN or STAFF role.
   */
  async restoreClient(id: string, expectedVersion?: number): Promise<ClientModel> {
    const encodedId = encodeURIComponent((id || '').trim());
    const headers: Record<string, string> = {};
    if (expectedVersion !== undefined) {
      headers['If-Match'] = `"${expectedVersion}"`;
    }

    return httpClient.patch<ClientModel>(`/api/v1/clients/${encodedId}/restore`, {}, { headers });
  },

  /**
   * Links authenticated user account identity to client profile.
   */
  async linkIdentity(id: string, payload: LinkIdentityInputDTO): Promise<ClientModel> {
    const encodedId = encodeURIComponent((id || '').trim());
    return httpClient.post<ClientModel>(`/api/v1/clients/${encodedId}/link-identity`, {
      identityId: payload.identityId.trim(),
    });
  },

  /**
   * Retrieves paginated longitudinal activity timeline for a client.
   */
  async getClientTimeline(
    clientId: string,
    params?: ClientTimelineParams,
  ): Promise<PaginatedClientTimeline> {
    const encodedId = encodeURIComponent((clientId || '').trim());
    return httpClient.get<PaginatedClientTimeline>(`/api/v1/clients/${encodedId}/timeline`, {
      params: params as Record<string, string | number | boolean | null | undefined>,
    });
  },
};
