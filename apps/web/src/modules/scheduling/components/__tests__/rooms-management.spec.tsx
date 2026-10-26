import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { RoomsPage } from '../../routes/rooms-page';
import { schedulingApi } from '../../api/scheduling-api';
import type { RoomModel } from '../../types/scheduling.types';
import * as authProvider from '../../../../app/providers/auth-provider';

// Mock scheduling API
jest.mock('../../api/scheduling-api');
const mockedSchedulingApi = schedulingApi as jest.Mocked<typeof schedulingApi>;

// Mock Notification Provider
jest.mock('../../../../app/providers/notification-provider', () => ({
  useNotification: () => ({
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
  }),
}));

// Mock Auth Provider
jest.mock('../../../../app/providers/auth-provider', () => ({
  useAuth: jest.fn(),
}));

const mockRooms: RoomModel[] = [
  {
    id: 'room_hydro_1',
    name: 'Hydrotherapy Suite 1',
    capacity: 2,
    status: 'AVAILABLE',
    features: ['hydrotherapy_tub', 'soundproof'],
    maintenanceWindows: [
      {
        id: 'mw_1',
        roomId: 'room_hydro_1',
        startTime: '2026-10-28T14:00:00.000Z',
        endTime: '2026-10-28T16:00:00.000Z',
        reason: 'Water filtration system maintenance',
        createdAt: '2026-10-24T00:00:00.000Z',
      },
    ],
    version: 3,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
  {
    id: 'room_consult_2',
    name: 'Consultation Room 2',
    capacity: 1,
    status: 'UNAVAILABLE',
    maintenanceReason: 'Deep sanitization and repainting',
    features: ['adjustable_table', 'dimmable_lighting'],
    maintenanceWindows: [],
    version: 1,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  },
];

const createTestWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/rooms']}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
};

describe('Room & Resource Management Directory and Availability (Milestone 4.5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (authProvider.useAuth as jest.Mock).mockReturnValue({
      currentUser: {
        id: 'usr_admin',
        roles: ['ADMIN'],
        permissions: ['settings.read', 'settings.write', 'appointments.read'],
      },
      isAuthenticated: true,
      hasPermission: (perm: string) =>
        ['settings.read', 'settings.write', 'appointments.read'].includes(perm),
      hasRole: (r: string) => ['ADMIN'].includes(r),
    });

    mockedSchedulingApi.listRooms.mockResolvedValue(mockRooms);
    mockedSchedulingApi.checkRoomAvailability.mockResolvedValue({
      isAvailable: true,
      availableRooms: mockRooms,
    });
  });

  describe('1. Directory Loading, Empty, and Populated States', () => {
    it('renders loading skeleton while fetching rooms', () => {
      mockedSchedulingApi.listRooms.mockImplementationOnce(() => new Promise(() => {}));

      render(<RoomsPage />, { wrapper: createTestWrapper() });

      expect(screen.getByLabelText(/Loading rooms directory/i)).toBeInTheDocument();
    });

    it('renders error state with retry when listRooms query fails', async () => {
      mockedSchedulingApi.listRooms.mockRejectedValueOnce(new Error('Network transport failure'));

      render(<RoomsPage />, { wrapper: createTestWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Failed to load room directory')).toBeInTheDocument();
      });
      expect(screen.getByText('Network transport failure')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Try Again/i })).toBeInTheDocument();
    });

    it('renders empty state when no rooms exist', async () => {
      mockedSchedulingApi.listRooms.mockResolvedValueOnce([]);

      render(<RoomsPage />, { wrapper: createTestWrapper() });

      await waitFor(() => {
        expect(screen.getByText('No Rooms Registered Yet')).toBeInTheDocument();
      });
      expect(screen.getByRole('button', { name: /Register First Room/i })).toBeInTheDocument();
    });

    it('renders populated directory cards with capacities, status, and features', async () => {
      render(<RoomsPage />, { wrapper: createTestWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Hydrotherapy Suite 1')).toBeInTheDocument();
      });

      expect(screen.getByText('Consultation Room 2')).toBeInTheDocument();
      expect(screen.getAllByText(/Capacity:/i).length).toBeGreaterThan(0);
      expect(screen.getByText('Available')).toBeInTheDocument();
      expect(screen.getByText('Unavailable')).toBeInTheDocument();
      expect(screen.getByText('1 maintenance')).toBeInTheDocument();
    });
  });

  describe('2. Client-Side Filtering & Search', () => {
    it('filters rooms by search term', async () => {
      render(<RoomsPage />, { wrapper: createTestWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Hydrotherapy Suite 1')).toBeInTheDocument();
      });

      const searchInput = screen.getByLabelText(/Search rooms/i);
      fireEvent.change(searchInput, { target: { value: 'Consult' } });

      expect(screen.queryByText('Hydrotherapy Suite 1')).not.toBeInTheDocument();
      expect(screen.getByText('Consultation Room 2')).toBeInTheDocument();
      expect(screen.getByText(/rooms matching filters/i)).toBeInTheDocument();
    });

    it('filters rooms by operational status', async () => {
      render(<RoomsPage />, { wrapper: createTestWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Hydrotherapy Suite 1')).toBeInTheDocument();
      });

      const statusSelect = screen.getByLabelText(/Filter by operational status/i);
      fireEvent.change(statusSelect, { target: { value: 'AVAILABLE' } });

      expect(screen.getByText('Hydrotherapy Suite 1')).toBeInTheDocument();
      expect(screen.queryByText('Consultation Room 2')).not.toBeInTheDocument();
    });

    it('filters rooms by minimum capacity', async () => {
      render(<RoomsPage />, { wrapper: createTestWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Hydrotherapy Suite 1')).toBeInTheDocument();
      });

      const capacityInput = screen.getByLabelText(/Filter by minimum client capacity/i);
      fireEvent.change(capacityInput, { target: { value: '2' } });

      expect(screen.getByText('Hydrotherapy Suite 1')).toBeInTheDocument();
      expect(screen.queryByText('Consultation Room 2')).not.toBeInTheDocument();
    });
  });

  describe('3. Create Room Operations & Validations', () => {
    it('validates required fields and creates a new room', async () => {
      mockedSchedulingApi.createRoom.mockResolvedValueOnce({
        id: 'room_cryo_3',
        name: 'Cryotherapy Pod A',
        capacity: 1,
        status: 'AVAILABLE',
        features: ['cryo_pod'],
        maintenanceWindows: [],
        version: 1,
        createdAt: '2026-10-24T00:00:00.000Z',
        updatedAt: '2026-10-24T00:00:00.000Z',
      });

      render(<RoomsPage />, { wrapper: createTestWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Hydrotherapy Suite 1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Add Room/i }));

      expect(screen.getByText('Register New Room')).toBeInTheDocument();

      const nameInput = screen.getByLabelText(/Room Name/i);
      fireEvent.change(nameInput, { target: { value: 'Cryotherapy Pod A' } });

      // Select preset feature
      fireEvent.click(screen.getByRole('button', { name: /soundproof/i }));

      // Submit
      fireEvent.click(screen.getByRole('button', { name: /^Register Room$/i }));

      await waitFor(() => {
        expect(mockedSchedulingApi.createRoom).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Cryotherapy Pod A',
            capacity: 1,
            features: expect.arrayContaining(['soundproof']),
          }),
        );
      });
    });

    it('displays error and keeps input intact when creation fails', async () => {
      mockedSchedulingApi.createRoom.mockRejectedValueOnce(
        new Error('Room with this name already exists in facility catalog.'),
      );

      render(<RoomsPage />, { wrapper: createTestWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Hydrotherapy Suite 1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /Add Room/i }));

      const nameInput = screen.getByLabelText(/Room Name/i);
      fireEvent.change(nameInput, { target: { value: 'Hydrotherapy Suite 1' } });

      fireEvent.click(screen.getByRole('button', { name: /^Register Room$/i }));

      await waitFor(() => {
        expect(screen.getByText('Registration Failed')).toBeInTheDocument();
      });
      expect(
        screen.getByText('Room with this name already exists in facility catalog.'),
      ).toBeInTheDocument();
      expect(nameInput).toHaveValue('Hydrotherapy Suite 1');
    });
  });

  describe('4. Edit Room & Concurrency Version Control', () => {
    it('submits edit with expectedVersion and updates room', async () => {
      mockedSchedulingApi.editRoom.mockResolvedValueOnce({
        ...mockRooms[0]!,
        name: 'Hydrotherapy Suite 1 - Expanded',
        capacity: 3,
        version: 4,
      });

      render(<RoomsPage />, { wrapper: createTestWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Hydrotherapy Suite 1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText(/Edit Hydrotherapy Suite 1/i));

      expect(screen.getByText(/Edit Room: Hydrotherapy Suite 1/i)).toBeInTheDocument();
      expect(screen.getByText(/Version #3/i)).toBeInTheDocument();

      const nameInput = screen.getByLabelText(/Room Name/i);
      fireEvent.change(nameInput, { target: { value: 'Hydrotherapy Suite 1 - Expanded' } });

      const capacityInput = screen.getByLabelText(/Maximum Client Capacity/i);
      fireEvent.change(capacityInput, { target: { value: '3' } });

      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(mockedSchedulingApi.editRoom).toHaveBeenCalledWith('room_hydro_1', {
          name: 'Hydrotherapy Suite 1 - Expanded',
          capacity: 3,
          features: ['hydrotherapy_tub', 'soundproof'],
          expectedVersion: 3,
        });
      });
    });

    it('handles optimistic concurrency lock error (HTTP 409)', async () => {
      mockedSchedulingApi.editRoom.mockRejectedValueOnce({
        statusCode: 409,
        message: 'Optimistic lock version conflict: expected version 3 but found 4.',
      });

      render(<RoomsPage />, { wrapper: createTestWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Hydrotherapy Suite 1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText(/Edit Hydrotherapy Suite 1/i));

      fireEvent.click(screen.getByRole('button', { name: /Save Changes/i }));

      await waitFor(() => {
        expect(screen.getByText('Concurrency Version Conflict')).toBeInTheDocument();
      });
      expect(
        screen.getByText(/This room was updated by another staff member/i),
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Reload Latest Room State/i })).toBeInTheDocument();
    });
  });

  describe('5. Status Transitions (Activate & Deactivate)', () => {
    it('deactivates room with mandatory explanation reason', async () => {
      mockedSchedulingApi.deactivateRoom.mockResolvedValueOnce({
        ...mockRooms[0]!,
        status: 'UNAVAILABLE',
        maintenanceReason: 'Facility electrical overhaul',
        version: 4,
      });

      render(<RoomsPage />, { wrapper: createTestWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Hydrotherapy Suite 1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText(/Deactivate Hydrotherapy Suite 1/i));

      expect(screen.getByText(/Deactivate Room: Hydrotherapy Suite 1/i)).toBeInTheDocument();

      const reasonInput = screen.getByLabelText(/Deactivation Reason/i);
      fireEvent.change(reasonInput, { target: { value: 'Facility electrical overhaul' } });

      fireEvent.click(screen.getByRole('button', { name: /^Deactivate Room$/i }));

      await waitFor(() => {
        expect(mockedSchedulingApi.deactivateRoom).toHaveBeenCalledWith('room_hydro_1', {
          reason: 'Facility electrical overhaul',
          expectedVersion: 3,
        });
      });
    });

    it('activates an unavailable room back to AVAILABLE status', async () => {
      mockedSchedulingApi.activateRoom.mockResolvedValueOnce({
        ...mockRooms[1]!,
        status: 'AVAILABLE',
        maintenanceReason: undefined,
        version: 2,
      });

      render(<RoomsPage />, { wrapper: createTestWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Consultation Room 2')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText(/Activate Consultation Room 2/i));

      await waitFor(() => {
        expect(mockedSchedulingApi.activateRoom).toHaveBeenCalledWith('room_consult_2', {
          expectedVersion: 1,
        });
      });
    });
  });

  describe('6. Temporal Maintenance Windows (Schedule & Cancel)', () => {
    it('schedules a temporal maintenance window with facility timezone conversion', async () => {
      mockedSchedulingApi.scheduleMaintenance.mockResolvedValueOnce({
        ...mockRooms[0]!,
        maintenanceWindows: [
          ...mockRooms[0]!.maintenanceWindows,
          {
            id: 'mw_2',
            roomId: 'room_hydro_1',
            startTime: '2026-10-26T16:00:00.000Z',
            endTime: '2026-10-26T18:00:00.000Z',
            reason: 'Filter replacement',
            createdAt: '2026-10-24T00:00:00.000Z',
          },
        ],
        version: 4,
      });

      render(<RoomsPage />, { wrapper: createTestWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Hydrotherapy Suite 1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText(/Schedule maintenance for Hydrotherapy Suite 1/i));

      expect(screen.getByText(/Schedule Maintenance Window/i)).toBeInTheDocument();

      const dateInput = screen.getByLabelText(/Maintenance Date/i);
      fireEvent.change(dateInput, { target: { value: '2026-10-26' } });

      const startInput = screen.getByLabelText(/Start Time/i);
      fireEvent.change(startInput, { target: { value: '12:00' } });

      const endInput = screen.getByLabelText(/End Time/i);
      fireEvent.change(endInput, { target: { value: '14:00' } });

      const reasonInput = screen.getByLabelText(/Maintenance Explanation Reason/i);
      fireEvent.change(reasonInput, { target: { value: 'Filter replacement' } });

      fireEvent.click(screen.getByRole('button', { name: /^Schedule Maintenance$/i }));

      await waitFor(() => {
        expect(mockedSchedulingApi.scheduleMaintenance).toHaveBeenCalledWith(
          'room_hydro_1',
          expect.objectContaining({
            startTime: '2026-10-26T16:00:00.000Z', // 12:00 EDT -> 16:00 UTC
            endTime: '2026-10-26T18:00:00.000Z', // 14:00 EDT -> 18:00 UTC
            reason: 'Filter replacement',
            expectedVersion: 3,
          }),
        );
      });
    });

    it('cancels scheduled maintenance window from room detail modal', async () => {
      mockedSchedulingApi.cancelMaintenance.mockResolvedValueOnce({
        ...mockRooms[0]!,
        maintenanceWindows: [],
        version: 4,
      });

      render(<RoomsPage />, { wrapper: createTestWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Hydrotherapy Suite 1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText(/View details for Hydrotherapy Suite 1/i));

      expect(screen.getByText('Scheduled Maintenance Windows')).toBeInTheDocument();
      expect(screen.getByText(/Water filtration system maintenance/i)).toBeInTheDocument();

      const removeBtn = screen.getByRole('button', { name: /Cancel maintenance window/i });
      fireEvent.click(removeBtn);

      const confirmBtn = screen.getByRole('button', { name: /^Confirm$/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(mockedSchedulingApi.cancelMaintenance).toHaveBeenCalledWith('room_hydro_1', 'mw_1');
      });
    });
  });

  describe('7. Live Room Availability Checker', () => {
    it('evaluates room availability across a target time window', async () => {
      render(<RoomsPage />, { wrapper: createTestWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Hydrotherapy Suite 1')).toBeInTheDocument();
      });

      // Toggle availability tool
      fireEvent.click(screen.getByRole('button', { name: /Live Availability/i }));

      expect(screen.getByText('Live Room Availability Evaluation')).toBeInTheDocument();

      await waitFor(() => {
        expect(mockedSchedulingApi.checkRoomAvailability).toHaveBeenCalled();
        expect(screen.getByText(/Available Candidate Rooms/i)).toBeInTheDocument();
      });
    });
  });

  describe('8. Permission-Denied & RBAC Enforcement', () => {
    it('displays ForbiddenView when user lacks settings.read permission', () => {
      (authProvider.useAuth as jest.Mock).mockReturnValue({
        currentUser: {
          id: 'usr_guest',
          roles: ['CLIENT'],
          permissions: [],
        },
        isAuthenticated: true,
        hasPermission: () => false,
        hasRole: () => false,
      });

      render(<RoomsPage />, { wrapper: createTestWrapper() });

      expect(
        screen.getByText(/You do not have permission to view room directories/i),
      ).toBeInTheDocument();
      expect(mockedSchedulingApi.listRooms).not.toHaveBeenCalled();
    });

    it('hides room registration and management action buttons when user has only settings.read', async () => {
      (authProvider.useAuth as jest.Mock).mockReturnValue({
        currentUser: {
          id: 'usr_receptionist',
          roles: ['RECEPTIONIST'],
          permissions: ['settings.read'],
        },
        isAuthenticated: true,
        hasPermission: (perm: string) => perm === 'settings.read',
        hasRole: () => false,
      });

      render(<RoomsPage />, { wrapper: createTestWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Hydrotherapy Suite 1')).toBeInTheDocument();
      });

      // Add room button should not be present
      expect(screen.queryByRole('button', { name: /Add Room/i })).not.toBeInTheDocument();

      // Mutation buttons on room card should not be present
      expect(screen.queryByLabelText(/Edit Hydrotherapy Suite 1/i)).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Deactivate Hydrotherapy Suite 1/i)).not.toBeInTheDocument();

      // Details button should be present
      expect(screen.getByLabelText(/View details for Hydrotherapy Suite 1/i)).toBeInTheDocument();
    });
  });
});
