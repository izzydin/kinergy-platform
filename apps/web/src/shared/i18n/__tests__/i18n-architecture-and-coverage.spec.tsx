import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { en } from '../locales/en';
import { es } from '../locales/es';
import { flattenTranslationKeys, getDictionaryValue, translate } from '../translator';
import {
  resolveEmployeeLocale,
  saveEmployeeLocalePreference,
  getActiveSessionLocaleRecord,
  clearActiveEmployeeLocaleSession,
  getUnauthenticatedSessionLocale,
  setUnauthenticatedSessionLocale,
} from '../preference-storage';
import {
  formatLocaleDate,
  formatLocaleTime,
  formatLocaleDateTime,
  formatLocaleNumber,
  formatLocalePercent,
  formatLocaleCurrency,
  formatLocaleCurrencyCents,
} from '../formatters';
import { translateApiError } from '../error-translator';
import { LanguageSelector } from '../language-selector';
import { LocaleProvider, useTranslation } from '../../../app/providers/locale-provider';
import { AuthProvider, type AuthUser } from '../../../app/providers/auth-provider';
import { FeatureFlagProvider } from '../../../app/providers/feature-flag-provider';
import { NavigationProvider } from '../../../app/navigation';
import { Sidebar } from '../../components/sidebar/sidebar';
import { UserMenu } from '../../components/header/user-menu';
import { Breadcrumb } from '../../../app/breadcrumbs/breadcrumb';
import { BreadcrumbProvider } from '../../../app/breadcrumbs/breadcrumb-provider';
import { LoginView } from '../../../modules/identity/authentication/components/login-view';
import { GeneralSettingsPage } from '../../../modules/settings/routes/general-settings-page';
import { PosConfirmation } from '../../../modules/sales/components/pos/pos-confirmation';
import { PosCategorySelector } from '../../../modules/sales/components/pos/pos-category-selector';
import { PosCart } from '../../../modules/sales/components/pos/pos-cart';
import { PosPaymentPanel } from '../../../modules/sales/components/pos/pos-payment-panel';
import { SaleStatusBadge } from '../../../modules/sales/components/sale-status-badge';
import { ClientStatusBadge } from '../../../modules/client/components/client-status-badge';
import { PaymentMethodBadge } from '../../../modules/sales/components/payment-method-badge';
import type { NestedTranslationDictionary, TranslationParams } from '../types';

const mockEmployeeA: AuthUser = {
  id: 'usr-owner-001',
  name: 'Elena Vargas',
  email: 'owner@kinergy.platform',
  tenantId: 'tenant-kinergy-main',
  roles: ['OWNER'],
  permissions: ['*'],
};

const mockEmployeeB: AuthUser = {
  id: 'usr-reception-002',
  name: 'Lucas Morales',
  email: 'reception.demo@kinergy.platform',
  tenantId: 'tenant-kinergy-main',
  roles: ['RECEPTIONIST'],
  permissions: ['sales.read', 'sales.create', 'clients.read'],
};

describe('Application-Wide Internationalization (en & es) Architecture & Coverage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.documentElement.lang = 'en';
  });

  describe('1. Translation Dictionary Parity (en vs es)', () => {
    it('maintains 100% key parity between English (en) and Spanish (es) dictionaries with no empty values', () => {
      const enDict = en as unknown as NestedTranslationDictionary;
      const esDict = es as unknown as NestedTranslationDictionary;

      const enKeys = flattenTranslationKeys(enDict).sort();
      const esKeys = flattenTranslationKeys(esDict).sort();

      expect(esKeys).toEqual(enKeys);
      expect(enKeys.length).toBeGreaterThan(250);

      for (const key of enKeys) {
        const enVal = getDictionaryValue(enDict, key);
        const esVal = getDictionaryValue(esDict, key);
        expect(enVal?.trim().length).toBeGreaterThan(0);
        expect(esVal?.trim().length).toBeGreaterThan(0);
      }
    });

    it('falls back gracefully to English or explicit fallback when a key is missing in Spanish', () => {
      expect(translate('es', 'non.existent.key', 'Explicit Fallback')).toBe('Explicit Fallback');
      expect(translate('es', 'non.existent.key')).toBe('non.existent.key');
      expect(translate('es', 'crud.showingCount', undefined, { from: 1, to: 10, total: 42 })).toBe(
        'Mostrando 1 a 10 de 42 resultados',
      );
    });
  });

  describe('2. Per-Employee Language Preference Persistence & Isolation', () => {
    it('defaults to English (en) when an employee has no stored language preference', () => {
      expect(resolveEmployeeLocale(mockEmployeeA.id, mockEmployeeA.email)).toBe('en');
      expect(getUnauthenticatedSessionLocale()).toBeNull();
    });

    it('persists language preference per employee across refreshes and isolates User A from User B across logout/login', () => {
      // User A selects Spanish
      saveEmployeeLocalePreference('es', mockEmployeeA.id, mockEmployeeA.email);
      expect(resolveEmployeeLocale(mockEmployeeA.id, mockEmployeeA.email)).toBe('es');

      // Browser refresh while User A is logged in (active session record restores 'es' synchronously)
      expect(getActiveSessionLocaleRecord()?.locale).toBe('es');

      // User A logs out
      clearActiveEmployeeLocaleSession();
      expect(getActiveSessionLocaleRecord()).toBeNull();

      // User B logs in (no saved preference -> defaults to English)
      expect(resolveEmployeeLocale(mockEmployeeB.id, mockEmployeeB.email)).toBe('en');

      // User B saves English while User A's preference remains Spanish when User A logs back in
      saveEmployeeLocalePreference('en', mockEmployeeB.id, mockEmployeeB.email);
      clearActiveEmployeeLocaleSession();

      expect(resolveEmployeeLocale(mockEmployeeA.id, mockEmployeeA.email)).toBe('es');
      expect(resolveEmployeeLocale(mockEmployeeB.id, mockEmployeeB.email)).toBe('en');
    });

    it('persists unauthenticated login language preference in session storage', () => {
      expect(getUnauthenticatedSessionLocale()).toBeNull();
      setUnauthenticatedSessionLocale('es');
      expect(getUnauthenticatedSessionLocale()).toBe('es');
    });
  });

  describe('3. Immediate Reactive Language Switching & DOM lang Synchronization', () => {
    const TestConsumer: React.FC = () => {
      const { locale, t } = useTranslation();
      return (
        <div>
          <span data-testid="active-locale">{locale}</span>
          <h1 data-testid="translated-heading">{t('dashboard.title')}</h1>
          <p data-testid="user-generated-content">Client: María Fernanda Gómez — SKU-9912</p>
          <LanguageSelector variant="card" />
        </div>
      );
    };

    it('updates UI immediately without page reload and preserves user-generated data', () => {
      render(
        <AuthProvider initialSessionOverride={mockEmployeeA} skipBootstrap>
          <LocaleProvider>
            <TestConsumer />
          </LocaleProvider>
        </AuthProvider>,
      );

      expect(screen.getByTestId('active-locale')).toHaveTextContent('en');
      expect(screen.getByTestId('translated-heading')).toHaveTextContent('Operational Dashboard');
      expect(document.documentElement.lang).toBe('en');

      // Switch to Spanish
      fireEvent.click(screen.getByTestId('lang-option-es'));

      expect(screen.getByTestId('active-locale')).toHaveTextContent('es');
      expect(screen.getByTestId('translated-heading')).toHaveTextContent(
        'Panel principal operativo',
      );
      expect(document.documentElement.lang).toBe('es');

      // User-generated content is untouched
      expect(screen.getByTestId('user-generated-content')).toHaveTextContent(
        'Client: María Fernanda Gómez — SKU-9912',
      );

      // Switch back to English
      fireEvent.click(screen.getByTestId('lang-option-en'));
      expect(screen.getByTestId('active-locale')).toHaveTextContent('en');
      expect(screen.getByTestId('translated-heading')).toHaveTextContent('Operational Dashboard');
    });
  });

  describe('4. Locale-Aware Date, Number, Percentage & Currency Formatting (Financial Integrity)', () => {
    it('formats dates, numbers, and percentages according to locale while preserving exact USD currency amounts', () => {
      const sampleIso = '2026-03-15T14:30:00.000Z';
      expect(formatLocaleDate(sampleIso, 'en')).toBeTruthy();
      expect(formatLocaleDate(sampleIso, 'es')).toBeTruthy();
      expect(formatLocaleTime(sampleIso, 'en')).toBeTruthy();
      expect(formatLocaleDateTime(sampleIso, 'es')).toBeTruthy();

      expect(formatLocaleNumber(1250, 'en')).toContain('1,250');
      expect(formatLocalePercent(15, 'en')).toBe('15%');
      expect(formatLocalePercent(15, 'es')).toContain('15');

      // Financial invariant: switching locale NEVER alters monetary values or currency code
      const enCurrency = formatLocaleCurrency(49.99, 'USD', 'en');
      const esCurrency = formatLocaleCurrency(49.99, 'USD', 'es');
      expect(enCurrency).toContain('49.99');
      expect(esCurrency).toMatch(/49[.,]99/);

      const enCents = formatLocaleCurrencyCents(12500, 'USD', 'en');
      const esCents = formatLocaleCurrencyCents(12500, 'USD', 'es');
      expect(enCents).toContain('125.00');
      expect(esCents).toMatch(/125[.,]00/);
    });
  });

  describe('5. Localized API Error Mapping', () => {
    const tEs = (
      key: string,
      fallbackOrParams?: string | TranslationParams,
      params?: TranslationParams,
    ) => translate('es', key, fallbackOrParams, params);

    it('maps stable API error codes and HTTP statuses to Spanish user-facing messages', () => {
      expect(translateApiError({ code: 'VALIDATION_ERROR', status: 400 }, tEs)).toBe(
        es.errors.VALIDATION_ERROR,
      );
      expect(translateApiError({ code: 'UNAUTHORIZED', status: 401 }, tEs)).toBe(
        es.errors.UNAUTHORIZED,
      );
      expect(translateApiError({ code: 'FORBIDDEN', status: 403 }, tEs)).toBe(es.errors.FORBIDDEN);
      expect(translateApiError({ code: 'NOT_FOUND', status: 404 }, tEs)).toBe(es.errors.NOT_FOUND);
      expect(
        translateApiError({ message: 'A primary receipt already exists for sale pos_123' }, tEs),
      ).toBe(es.errors.DUPLICATE_RECEIPT);
      expect(translateApiError({ message: 'Failed to fetch network' }, tEs)).toBe(
        es.errors.NETWORK_ERROR,
      );
    });
  });

  describe('6. Representative Screens & Components in Spanish (es)', () => {
    it('renders Navigation Sidebar, Breadcrumb, and UserMenu in Spanish', () => {
      saveEmployeeLocalePreference('es', mockEmployeeA.id, mockEmployeeA.email);

      render(
        <MemoryRouter initialEntries={['/sales/list']}>
          <AuthProvider initialSessionOverride={mockEmployeeA} skipBootstrap>
            <FeatureFlagProvider>
              <LocaleProvider>
                <NavigationProvider>
                  <BreadcrumbProvider>
                    <Sidebar />
                    <Breadcrumb />
                    <UserMenu />
                  </BreadcrumbProvider>
                </NavigationProvider>
              </LocaleProvider>
            </FeatureFlagProvider>
          </AuthProvider>
        </MemoryRouter>,
      );

      expect(screen.getAllByText('Panel principal').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Ventas y pagos').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Perfiles de clientes').length).toBeGreaterThan(0);

      // Open UserMenu and verify language options & Sign Out in Spanish
      fireEvent.click(screen.getByRole('button', { name: /User account menu for/i }));
      expect(screen.getByTestId('user-menu-lang-es')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByText('Cerrar sesión')).toBeInTheDocument();
    });

    it('renders LoginView and GeneralSettingsPage in Spanish', () => {
      saveEmployeeLocalePreference('es', mockEmployeeA.id, mockEmployeeA.email);
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter>
            <AuthProvider initialSessionOverride={mockEmployeeA} skipBootstrap>
              <LocaleProvider>
                <LoginView />
                <GeneralSettingsPage />
              </LocaleProvider>
            </AuthProvider>
          </MemoryRouter>
        </QueryClientProvider>,
      );

      expect(screen.getAllByText('Iniciar sesión').length).toBeGreaterThan(0);
      expect(screen.getByText('Correo electrónico')).toBeInTheDocument();
      expect(screen.getByText('Preferencias de idioma y región')).toBeInTheDocument();
      expect(screen.getByText('Perfil del empleado autenticado')).toBeInTheDocument();
    });

    it('renders POS Completion screen in Spanish without Keep Customer button and renders POS controls & status badges in Spanish', () => {
      saveEmployeeLocalePreference('es', mockEmployeeA.id, mockEmployeeA.email);

      render(
        <MemoryRouter>
          <AuthProvider initialSessionOverride={mockEmployeeA} skipBootstrap>
            <LocaleProvider>
              <PosConfirmation
                summary={{
                  saleId: 'pos_999',
                  clientName: 'Carlos Mendoza',
                  isWalkIn: false,
                  items: [],
                  subtotalAmount: 45,
                  discountAmount: 0,
                  totalAmount: 45,
                  currency: 'USD',
                  paymentMethod: 'CASH',
                  paymentStatus: 'SETTLED',
                  tenderAmount: 50,
                  changeAmount: 5,
                  receiptNumber: 'REC-2026-0099',
                  completedAt: '2026-03-15T14:30:00.000Z',
                }}
                onStartNewSale={jest.fn()}
              />
              <PosCategorySelector selectedCategory="GYM_MEMBERSHIP" onSelectCategory={jest.fn()} />
              <PosCart
                items={[]}
                currency="USD"
                onUpdateQuantity={jest.fn()}
                onRemoveItem={jest.fn()}
                onClearCart={jest.fn()}
                onSetOrderDiscount={jest.fn()}
              />
              <PosPaymentPanel
                netTotalCents={4500}
                currency="USD"
                isCartEmpty={false}
                isSubmitting={false}
                onCheckout={jest.fn()}
                onSaveDraft={jest.fn()}
              />
              <SaleStatusBadge status="PAID" />
              <ClientStatusBadge status="ACTIVE" />
              <PaymentMethodBadge method="CASH" />
            </LocaleProvider>
          </AuthProvider>
        </MemoryRouter>,
      );

      expect(screen.getByText('Venta completada exitosamente')).toBeInTheDocument();
      expect(screen.getByTestId('pos-new-sale-btn')).toHaveTextContent('Iniciar nueva venta');
      expect(screen.queryByTestId('pos-new-sale-same-client-btn')).not.toBeInTheDocument();
      expect(screen.queryByText(/Keep Customer/i)).not.toBeInTheDocument();

      // POS Controls & Badges in Spanish
      expect(screen.getByText('Membresías de gimnasio')).toBeInTheDocument();
      expect(screen.getByText('El carrito está vacío')).toBeInTheDocument();
      expect(screen.getByText('Pago y cobro')).toBeInTheDocument();
      expect(screen.getByText('Pagado')).toBeInTheDocument();
      expect(screen.getByText('Activo')).toBeInTheDocument();
      expect(screen.getAllByText('Efectivo').length).toBeGreaterThan(0);
    });
  });
});
