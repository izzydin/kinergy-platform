import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Sidebar } from '../../../shared/components/sidebar/sidebar';
import { AuthProvider } from '../../../app/providers/auth-provider';
import { FeatureFlagProvider } from '../../../app/providers/feature-flag-provider';
import { NavigationProvider } from '../../../app/navigation/navigation-provider';
import { NavigationBuilder } from '../../../app/navigation/navigation.builder';
import type { NavigationItem } from '../../../app/navigation/navigation.types';
import type { AuthUser } from '../../auth/domain/auth-state.types';
import {
  intelligenceNavigationItems,
  registerIntelligenceNavigation,
} from '../navigation/intelligence-navigation.config';
import { IntelligenceLayout } from '../components/intelligence-layout';
import { IntelligenceSubRouter } from '../routes/intelligence.router';
import { ProtectedRoute } from '../../../app/routes/protected-route';
import {
  canAccessKnowledgeCenter,
  KNOWLEDGE_ALLOWED_ROLES,
} from '../routes/intelligence-knowledge-guard';

const ADMIN_USER: AuthUser = {
  id: 'usr-admin-1',
  email: 'admin@kinergy.platform',
  name: 'Platform Admin',
  roles: ['ADMIN'],
  permissions: ['client:read', 'settings.read'],
  tenantId: 'tenant-1',
};

const ENERGY_MANAGER_USER: AuthUser = {
  id: 'usr-energy-1',
  email: 'energy@kinergy.platform',
  name: 'Energy Manager',
  roles: ['ENERGY_MANAGER'],
  permissions: ['energy:read'],
  tenantId: 'tenant-1',
};

const OPERATOR_USER: AuthUser = {
  id: 'usr-operator-1',
  email: 'operator@kinergy.platform',
  name: 'Facility Operator',
  roles: ['OPERATOR'],
  permissions: ['client:read'],
  tenantId: 'tenant-1',
};

function renderSidebarWithIntelligence(
  initialEntries: string[] = ['/intelligence/chat'],
  userOverride?: AuthUser,
) {
  registerIntelligenceNavigation();

  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider initialSessionOverride={userOverride} skipBootstrap={!userOverride}>
        <FeatureFlagProvider>
          <NavigationProvider>
            <Routes>
              <Route path="*" element={<Sidebar />} />
            </Routes>
          </NavigationProvider>
        </FeatureFlagProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function renderIntelligenceLayoutWithAuth(
  initialEntries: string[] = ['/intelligence/chat'],
  userOverride?: AuthUser,
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthProvider initialSessionOverride={userOverride} skipBootstrap={!userOverride}>
        <IntelligenceLayout>
          <div data-testid="test-intelligence-view">Workspace Content</div>
        </IntelligenceLayout>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('AI-09.1.04: Intelligence Navigation & Permission-Aware Access', () => {
  beforeEach(() => {
    registerIntelligenceNavigation();
  });

  describe('1. Navigation Builder Role Evaluation & Grouping', () => {
    it('groups intelligence items under section "intelligence" with title "Intelligence"', () => {
      const sections = NavigationBuilder.build({
        items: intelligenceNavigationItems,
        hasRole: () => true,
      });

      expect(sections).toHaveLength(1);
      const section = sections[0];
      expect(section).toBeDefined();
      expect(section?.id).toBe('intelligence');
      expect(section?.title).toBe('Intelligence');
      expect(section?.items).toHaveLength(2);
      expect(section?.items.map((i: NavigationItem) => i.id)).toEqual([
        'intelligence:chat',
        'intelligence:knowledge',
      ]);
    });

    it('filters out Knowledge Center for non-administrative roles (OPERATOR)', () => {
      const sections = NavigationBuilder.build({
        items: intelligenceNavigationItems,
        hasRole: (role: string) => role === 'OPERATOR',
      });

      const allItems = sections.flatMap((s) => s.items);
      expect(allItems.map((i: NavigationItem) => i.id)).toEqual(['intelligence:chat']);
      expect(
        allItems.find((i: NavigationItem) => i.id === 'intelligence:knowledge'),
      ).toBeUndefined();
    });

    it('retains Knowledge Center for authorized managerial roles (ADMIN, ENERGY_MANAGER)', () => {
      const adminSections = NavigationBuilder.build({
        items: intelligenceNavigationItems,
        hasRole: (role: string) => role === 'ADMIN',
      });
      expect(adminSections.flatMap((s) => s.items).map((i: NavigationItem) => i.id)).toContain(
        'intelligence:knowledge',
      );

      const energySections = NavigationBuilder.build({
        items: intelligenceNavigationItems,
        hasRole: (role: string) => role === 'ENERGY_MANAGER',
      });
      expect(energySections.flatMap((s) => s.items).map((i: NavigationItem) => i.id)).toContain(
        'intelligence:knowledge',
      );
    });
  });

  describe('2. Sidebar Permission-Aware Navigation Visibility', () => {
    it('renders both AI Assistant and Knowledge Center in Sidebar for authorized ADMIN', () => {
      renderSidebarWithIntelligence(['/intelligence/chat'], ADMIN_USER);

      expect(screen.getByRole('link', { name: /ai assistant/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /knowledge center/i })).toBeInTheDocument();
    });

    it('renders AI Assistant but completely hides Knowledge Center for restricted OPERATOR', () => {
      renderSidebarWithIntelligence(['/intelligence/chat'], OPERATOR_USER);

      expect(screen.getByRole('link', { name: /ai assistant/i })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /knowledge center/i })).not.toBeInTheDocument();
    });
  });

  describe('3. IntelligenceLayout Permission-Aware Subnavigation Tabs', () => {
    it('renders both Chat and Knowledge tabs for authorized ENERGY_MANAGER', () => {
      renderIntelligenceLayoutWithAuth(['/intelligence/chat'], ENERGY_MANAGER_USER);

      expect(screen.getByRole('link', { name: /chat asistente/i })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /base de conocimiento/i })).toBeInTheDocument();
    });

    it('renders Chat tab but completely suppresses Knowledge tab for restricted OPERATOR', () => {
      renderIntelligenceLayoutWithAuth(['/intelligence/chat'], OPERATOR_USER);

      expect(screen.getByRole('link', { name: /chat asistente/i })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: /base de conocimiento/i })).not.toBeInTheDocument();
    });
  });

  describe('4. Active Route States & Nested Route Matching', () => {
    it('marks AI Assistant active when visiting /intelligence/chat', () => {
      renderSidebarWithIntelligence(['/intelligence/chat'], ADMIN_USER);

      const chatLink = screen.getByRole('link', { name: /ai assistant/i });
      expect(chatLink).toHaveAttribute('aria-current', 'page');
      expect(chatLink.className).toContain('bg-brand-forest');
    });

    it('marks AI Assistant active when visiting nested conversational route /intelligence/chat/conv-uuid-1234', () => {
      renderSidebarWithIntelligence(['/intelligence/chat/conv-uuid-1234'], ADMIN_USER);

      const chatLink = screen.getByRole('link', { name: /ai assistant/i });
      expect(chatLink).toHaveAttribute('aria-current', 'page');
    });

    it('marks Knowledge Center active when visiting /intelligence/knowledge', () => {
      renderSidebarWithIntelligence(['/intelligence/knowledge'], ADMIN_USER);

      const knowledgeLink = screen.getByRole('link', { name: /knowledge center/i });
      expect(knowledgeLink).toHaveAttribute('aria-current', 'page');
      expect(knowledgeLink.className).toContain('bg-brand-forest');
    });

    it('marks Knowledge Center active when visiting nested document route /intelligence/knowledge/documents/doc-999', () => {
      renderSidebarWithIntelligence(['/intelligence/knowledge/documents/doc-999'], ADMIN_USER);

      const knowledgeLink = screen.getByRole('link', { name: /knowledge center/i });
      expect(knowledgeLink).toHaveAttribute('aria-current', 'page');
    });
  });

  describe('5. Direct Route Authorization & Consistency with Navigation', () => {
    it('denies restricted OPERATOR accessing direct Knowledge URL with 403 ForbiddenView', async () => {
      render(
        <MemoryRouter initialEntries={['/intelligence/knowledge']}>
          <AuthProvider initialSessionOverride={OPERATOR_USER} skipBootstrap={false}>
            <Routes>
              <Route path="/intelligence/*" element={<IntelligenceSubRouter />} />
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      );

      expect(await screen.findByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/403 — Access Denied/i)).toBeInTheDocument();
      expect(
        screen.getByText(/se requieren privilegios de administración o gestión de energía/i),
      ).toBeInTheDocument();
    });

    it('redirects unauthenticated user accessing direct Chat URL to /auth/login', () => {
      render(
        <MemoryRouter initialEntries={['/intelligence/chat']}>
          <AuthProvider initialSessionOverride={null} skipBootstrap={false}>
            <Routes>
              <Route
                path="/intelligence/*"
                element={
                  <ProtectedRoute>
                    <IntelligenceSubRouter />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/auth/login"
                element={<div data-testid="login-view">Login Required</div>}
              />
            </Routes>
          </AuthProvider>
        </MemoryRouter>,
      );

      expect(screen.getByTestId('login-view')).toBeInTheDocument();
    });
  });

  describe('6. Reusable Authorization Utilities & Zero Hardcoded Assumptions', () => {
    it('canAccessKnowledgeCenter correctly validates allowed roles against ADR-AI-09-04', () => {
      expect(canAccessKnowledgeCenter(ADMIN_USER, (r: string) => r === 'ADMIN')).toBe(true);
      expect(
        canAccessKnowledgeCenter(ENERGY_MANAGER_USER, (r: string) => r === 'ENERGY_MANAGER'),
      ).toBe(true);
      expect(canAccessKnowledgeCenter(OPERATOR_USER, (r: string) => r === 'OPERATOR')).toBe(false);
      expect(canAccessKnowledgeCenter(null)).toBe(false);
    });

    it('KNOWLEDGE_ALLOWED_ROLES strictly contains only approved roles', () => {
      expect(KNOWLEDGE_ALLOWED_ROLES).toEqual(['SUPER_ADMIN', 'ADMIN', 'OWNER', 'ENERGY_MANAGER']);
    });
  });

  describe('7. Responsive & Accessible Navigation Quality', () => {
    it('preserves centered SVG icons and sr-only labels in collapsed desktop sidebar', () => {
      renderSidebarWithIntelligence(['/intelligence/chat'], ADMIN_USER);

      const collapseBtn = screen.getByRole('button', { name: /collapse sidebar/i });
      fireEvent.click(collapseBtn);

      const chatLink = screen.getByRole('link', { name: /ai assistant/i });
      const knowledgeLink = screen.getByRole('link', { name: /knowledge center/i });

      expect(chatLink.querySelector('svg')).toBeInTheDocument();
      expect(knowledgeLink.querySelector('svg')).toBeInTheDocument();

      expect(chatLink.querySelector('.sr-only')).toHaveTextContent(/ai assistant/i);
      expect(knowledgeLink.querySelector('.sr-only')).toHaveTextContent(/knowledge center/i);
    });

    it('supports mobile drawer toggle and Escape key dismissal', () => {
      renderSidebarWithIntelligence(['/intelligence/chat'], ADMIN_USER);

      const openDrawerBtn = screen.getByRole('button', { name: /open navigation drawer/i });
      fireEvent.click(openDrawerBtn);

      const closeDrawerBtn = screen.getByRole('button', { name: /close navigation drawer/i });
      expect(closeDrawerBtn).toBeInTheDocument();

      // Escape key dismisses mobile drawer
      fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
      expect(
        screen.queryByRole('button', { name: /close navigation drawer/i }),
      ).not.toBeInTheDocument();
    });
  });
});
