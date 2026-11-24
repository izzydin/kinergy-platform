import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { AppRouter } from '../../../app/routes/app-router';
import { AuthProvider } from '../../../app/providers/auth-provider';
import { NavigationProvider } from '../../../app/navigation/navigation-provider';
import { FeatureFlagProvider } from '../../../app/providers/feature-flag-provider';
import { NotificationProvider } from '../../../app/providers/notification-provider';
import { BreadcrumbProvider } from '../../../app/breadcrumbs/breadcrumb-provider';
import { SlotProvider } from '../../../shared/ui/slots';
import type { AuthUser } from '../../auth/domain/auth-state.types';

function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

// Full Administrator user (Authorized for both Chat and Knowledge)
const ADMIN_USER: AuthUser = {
  id: 'usr_admin_1',
  email: 'admin@kinergy.io',
  name: 'Admin User',
  roles: ['ADMIN', 'SUPER_ADMIN'],
  permissions: ['admin:all'],
  tenantId: 'tenant_alpha',
};

// Energy Manager user (Authorized for both Chat and Knowledge per ADR-AI-09-04)
const ENERGY_MANAGER_USER: AuthUser = {
  id: 'usr_energy_mgr',
  email: 'manager@kinergy.io',
  name: 'Energy Manager',
  roles: ['ENERGY_MANAGER'],
  permissions: ['energy:read', 'energy:write'],
  tenantId: 'tenant_alpha',
};

// Operator user (Authorized for Chat, but restricted from Knowledge Center)
const RESTRICTED_OPERATOR_USER: AuthUser = {
  id: 'usr_operator_1',
  email: 'operator@kinergy.io',
  name: 'Line Operator',
  roles: ['OPERATOR'],
  permissions: ['energy:read'],
  tenantId: 'tenant_alpha',
};

let activeLocation: { pathname: string; search: string } | null = null;

const LocationObserver: React.FC = () => {
  const location = useLocation();
  activeLocation = location;
  return null;
};

function renderAppAtRoute(initialPath: string, userOverride?: AuthUser | null) {
  const queryClient = createTestQueryClient();

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <LocationObserver />
        <SlotProvider>
          <NotificationProvider>
            <AuthProvider initialSessionOverride={userOverride}>
              <FeatureFlagProvider>
                <NavigationProvider>
                  <BreadcrumbProvider>
                    <AppRouter />
                  </BreadcrumbProvider>
                </NavigationProvider>
              </FeatureFlagProvider>
            </AuthProvider>
          </NotificationProvider>
        </SlotProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Intelligence Module Protected Routing (Milestone AI-09.1.02)', () => {
  beforeEach(() => {
    activeLocation = null;
  });

  describe('1. Unauthenticated Route Protection', () => {
    it('should redirect unauthenticated users away from /intelligence/chat to login', async () => {
      renderAppAtRoute('/intelligence/chat', null);

      await waitFor(() => {
        expect(activeLocation?.pathname).toBe('/auth/login');
      });
      expect(
        await screen.findByRole('heading', { level: 1, name: /sign in/i }),
      ).toBeInTheDocument();
    });

    it('should redirect unauthenticated users away from /intelligence/knowledge to login', async () => {
      renderAppAtRoute('/intelligence/knowledge', null);

      await waitFor(() => {
        expect(activeLocation?.pathname).toBe('/auth/login');
      });
      expect(
        await screen.findByRole('heading', { level: 1, name: /sign in/i }),
      ).toBeInTheDocument();
    });
  });

  describe('2. Root Route Redirection', () => {
    it('should redirect /intelligence to /intelligence/chat for authenticated user', async () => {
      renderAppAtRoute('/intelligence', ADMIN_USER);

      await waitFor(() => {
        expect(activeLocation?.pathname).toBe('/intelligence/chat');
      });

      expect(await screen.findByTestId('intelligence-chat-page')).toBeInTheDocument();
      expect(screen.getByTestId('intelligence-layout')).toBeInTheDocument();
    });
  });

  describe('3. AI Assistant Route', () => {
    it('should render ChatPage inside IntelligenceLayout and DashboardLayout for any authenticated user', async () => {
      renderAppAtRoute('/intelligence/chat', RESTRICTED_OPERATOR_USER);

      expect(await screen.findByTestId('intelligence-chat-page')).toBeInTheDocument();
      expect(screen.getByTestId('intelligence-layout')).toBeInTheDocument();
      expect(screen.getByText(/Asistente Conversacional Kynergy/i)).toBeInTheDocument();
    });

    it('should resolve active conversationId param in ChatPage deep links', async () => {
      renderAppAtRoute('/intelligence/chat/session-uuid-999', ADMIN_USER);

      expect(await screen.findByTestId('intelligence-chat-page')).toBeInTheDocument();
      expect(screen.getByText('session-uuid-999')).toBeInTheDocument();
    });
  });

  describe('4. Knowledge Center Route & Role Authorization (ADR-AI-09-04)', () => {
    it('should grant access to KnowledgePage for Admin user', async () => {
      renderAppAtRoute('/intelligence/knowledge', ADMIN_USER);

      expect(await screen.findByTestId('intelligence-knowledge-page')).toBeInTheDocument();
      expect(screen.getByTestId('intelligence-layout')).toBeInTheDocument();
      expect(screen.getByText(/Base de Conocimiento & Documentación/i)).toBeInTheDocument();
    });

    it('should grant access to KnowledgePage for Energy Manager user', async () => {
      renderAppAtRoute('/intelligence/knowledge', ENERGY_MANAGER_USER);

      expect(await screen.findByTestId('intelligence-knowledge-page')).toBeInTheDocument();
      expect(screen.getByText(/Base de Conocimiento & Documentación/i)).toBeInTheDocument();
    });

    it('should deny access (403 ForbiddenView) to Knowledge Center for restricted Operator', async () => {
      renderAppAtRoute('/intelligence/knowledge', RESTRICTED_OPERATOR_USER);

      // Should render 403 ForbiddenView without redirecting to login
      expect(
        await screen.findByText(/Se requieren privilegios de administración o gestión de energía/i),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('intelligence-knowledge-page')).not.toBeInTheDocument();
      // Verifies no redirect loop occurred
      expect(activeLocation?.pathname).toBe('/intelligence/knowledge');
    });

    it('should allow authorized Admin to view document details deep link', async () => {
      renderAppAtRoute('/intelligence/knowledge/documents/doc-archive-101', ADMIN_USER);

      expect(await screen.findByTestId('intelligence-document-detail-page')).toBeInTheDocument();
      expect(screen.getByText(/ID: doc-archive-101/i)).toBeInTheDocument();
    });

    it('should deny restricted Operator from viewing document details deep link', async () => {
      renderAppAtRoute(
        '/intelligence/knowledge/documents/doc-archive-101',
        RESTRICTED_OPERATOR_USER,
      );

      expect(
        await screen.findByText(/Se requieren privilegios de administración o gestión de energía/i),
      ).toBeInTheDocument();
      expect(screen.queryByTestId('intelligence-document-detail-page')).not.toBeInTheDocument();
    });
  });

  describe('5. Unknown Nested Routes', () => {
    it('should render NotFoundView for invalid sub-paths within /intelligence', async () => {
      renderAppAtRoute('/intelligence/invalid-sub-path', ADMIN_USER);

      expect(await screen.findByText(/Vista de Inteligencia no encontrada/i)).toBeInTheDocument();
    });
  });
});
