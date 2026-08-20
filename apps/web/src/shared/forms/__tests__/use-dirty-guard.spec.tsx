import '@testing-library/jest-dom';
import * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { useDirtyGuard } from '../hooks/use-dirty-guard';
import { ConfirmDiscardDialog } from '../components/confirm-discard-dialog';

// Polyfill Request if undefined in jsdom environment for @remix-run/router
if (typeof global.Request === 'undefined') {
  global.Request = class Request {} as unknown as typeof Request;
}

interface HarnessProps {
  isDirty?: boolean;
  isSubmitSuccessful?: boolean;
  enabled?: boolean;
  onProceedRef?: React.MutableRefObject<(() => void) | null>;
  onResetRef?: React.MutableRefObject<(() => void) | null>;
}

describe('useDirtyGuard & ConfirmDiscardDialog (C1.3 Contract)', () => {
  let addEventListenerSpy: jest.SpyInstance;
  let removeEventListenerSpy: jest.SpyInstance;

  beforeEach(() => {
    addEventListenerSpy = jest.spyOn(window, 'addEventListener');
    removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
  });

  afterEach(() => {
    addEventListenerSpy.mockRestore();
    removeEventListenerSpy.mockRestore();
  });

  function setupTestHarness(initialProps: HarnessProps = {}) {
    let currentProps = { ...initialProps };
    let rerenderHarness: () => void;

    const HarnessComponent: React.FC = () => {
      const [, setTick] = React.useState(0);
      rerenderHarness = () => setTick((t) => t + 1);

      const { isBlocked, proceed, reset } = useDirtyGuard({
        isDirty: currentProps.isDirty ?? false,
        isSubmitSuccessful: currentProps.isSubmitSuccessful ?? false,
        enabled: currentProps.enabled ?? true,
      });

      if (currentProps.onProceedRef) {
        currentProps.onProceedRef.current = proceed;
      }
      if (currentProps.onResetRef) {
        currentProps.onResetRef.current = reset;
      }

      return (
        <div>
          <div data-testid="is-blocked">{isBlocked ? 'blocked' : 'unblocked'}</div>
          <ConfirmDiscardDialog open={isBlocked} onConfirm={proceed} onCancel={reset} />
        </div>
      );
    };

    const routes = [
      {
        path: '/edit',
        element: <HarnessComponent />,
      },
      {
        path: '/dashboard',
        element: <div data-testid="dashboard-page">Dashboard</div>,
      },
      {
        path: '/settings',
        element: <div data-testid="settings-page">Settings</div>,
      },
    ];

    const capturedRouter = createMemoryRouter(routes, { initialEntries: ['/edit'] });

    const renderResult = render(<RouterProvider router={capturedRouter} />);

    const updateProps = (newProps: Partial<HarnessProps>) => {
      currentProps = { ...currentProps, ...newProps };
      act(() => {
        rerenderHarness();
      });
    };

    return {
      router: capturedRouter,
      updateProps,
      ...renderResult,
    };
  }

  describe('Route Navigation Blocking Logic', () => {
    it('does not block navigation when form is clean (isDirty: false)', async () => {
      const { router } = setupTestHarness({ isDirty: false });

      expect(screen.getByTestId('is-blocked')).toHaveTextContent('unblocked');

      await act(async () => {
        await router.navigate('/dashboard');
      });

      expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('blocks navigation when form is dirty (isDirty: true)', async () => {
      const { router } = setupTestHarness({ isDirty: true });

      expect(screen.getByTestId('is-blocked')).toHaveTextContent('unblocked');

      await act(async () => {
        await router.navigate('/dashboard');
      });

      // Intercepted and blocked
      expect(screen.getByTestId('is-blocked')).toHaveTextContent('blocked');
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
      expect(screen.queryByTestId('dashboard-page')).not.toBeInTheDocument();
    });

    it('cancels blocked navigation when reset() is called (user keeps editing)', async () => {
      const { router } = setupTestHarness({ isDirty: true });

      await act(async () => {
        await router.navigate('/dashboard');
      });

      expect(screen.getByTestId('is-blocked')).toHaveTextContent('blocked');

      // Click "Keep editing"
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /keep editing/i }));
      });

      expect(screen.getByTestId('is-blocked')).toHaveTextContent('unblocked');
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.queryByTestId('dashboard-page')).not.toBeInTheDocument();
    });

    it('proceeds with blocked navigation when proceed() is called (user discards changes)', async () => {
      const { router } = setupTestHarness({ isDirty: true });

      await act(async () => {
        await router.navigate('/settings');
      });

      expect(screen.getByTestId('is-blocked')).toHaveTextContent('blocked');

      // Click "Discard changes"
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /discard changes/i }));
      });

      await waitFor(() => {
        expect(screen.getByTestId('settings-page')).toBeInTheDocument();
      });

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not block navigation when enabled is false even if isDirty is true', async () => {
      const { router } = setupTestHarness({ isDirty: true, enabled: false });

      await act(async () => {
        await router.navigate('/dashboard');
      });

      expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('Form Lifecycle: Submit & Reset', () => {
    it('does not block navigation after successful form submission (isSubmitSuccessful: true)', async () => {
      const { router } = setupTestHarness({ isDirty: true, isSubmitSuccessful: true });

      await act(async () => {
        await router.navigate('/dashboard');
      });

      expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('does not block navigation after form resets to clean state', async () => {
      const { router, updateProps } = setupTestHarness({ isDirty: true });

      // Form is reset
      updateProps({ isDirty: false });

      await act(async () => {
        await router.navigate('/dashboard');
      });

      expect(screen.getByTestId('dashboard-page')).toBeInTheDocument();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });

  describe('Browser Unload (beforeunload) Listener Lifecycle', () => {
    it('attaches beforeunload listener when form becomes dirty', () => {
      const { updateProps } = setupTestHarness({ isDirty: false });

      expect(addEventListenerSpy).not.toHaveBeenCalledWith('beforeunload', expect.any(Function));

      // Transition to dirty
      updateProps({ isDirty: true });

      expect(addEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    });

    it('cleans up beforeunload listener when form becomes clean', () => {
      const { updateProps } = setupTestHarness({ isDirty: true });

      expect(addEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));

      // Transition to clean
      updateProps({ isDirty: false });

      expect(removeEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    });

    it('cleans up beforeunload listener when form successfully submits', () => {
      const { updateProps } = setupTestHarness({ isDirty: true, isSubmitSuccessful: false });

      // Transition to submit success
      updateProps({ isSubmitSuccessful: true });

      expect(removeEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    });

    it('cleans up beforeunload listener on component unmount', () => {
      const { unmount } = setupTestHarness({ isDirty: true });

      unmount();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    });
  });

  describe('Multiple Independent Form Instances', () => {
    it('keeps dirty guard states isolated across independent forms', () => {
      const MultiFormHarness = () => {
        const guardA = useDirtyGuard({ isDirty: true, isSubmitSuccessful: false });
        const guardB = useDirtyGuard({ isDirty: false, isSubmitSuccessful: false });

        return (
          <div>
            <span data-testid="status-a">{guardA.isBlocked ? 'blocked' : 'unblocked'}</span>
            <span data-testid="status-b">{guardB.isBlocked ? 'blocked' : 'unblocked'}</span>
          </div>
        );
      };

      const routes = [{ path: '/', element: <MultiFormHarness /> }];
      const router = createMemoryRouter(routes, { initialEntries: ['/'] });
      render(<RouterProvider router={router} />);

      expect(screen.getByTestId('status-a')).toHaveTextContent('unblocked');
      expect(screen.getByTestId('status-b')).toHaveTextContent('unblocked');
    });
  });

  describe('ConfirmDiscardDialog UI Integration', () => {
    it('renders accessible modal with title, description, and action buttons when open', () => {
      const onConfirm = jest.fn();
      const onCancel = jest.fn();

      render(<ConfirmDiscardDialog open={true} onConfirm={onConfirm} onCancel={onCancel} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Discard unsaved changes?')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /keep editing/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /discard changes/i })).toBeInTheDocument();
    });

    it('invokes onConfirm when discard button is clicked', () => {
      const onConfirm = jest.fn();
      const onCancel = jest.fn();

      render(<ConfirmDiscardDialog open={true} onConfirm={onConfirm} onCancel={onCancel} />);

      act(() => {
        screen.getByRole('button', { name: /discard changes/i }).click();
      });

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('invokes onCancel when keep editing button is clicked', () => {
      const onConfirm = jest.fn();
      const onCancel = jest.fn();

      render(<ConfirmDiscardDialog open={true} onConfirm={onConfirm} onCancel={onCancel} />);

      act(() => {
        screen.getByRole('button', { name: /keep editing/i }).click();
      });

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });
});
