import '@testing-library/jest-dom';
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  ValidationError,
} from '../../../shared/api';
import {
  NotificationProvider,
  formatNotificationError,
  notificationService,
  useNotification,
} from '../notification-provider';
import { act, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

const TestComponent: React.FC = () => {
  const { success, error, warning, info, clearAll } = useNotification();

  return (
    <div>
      <button onClick={() => success('Profile Updated', 'Your profile details were saved.')}>
        Trigger Success
      </button>
      <button
        onClick={() =>
          error(new ValidationError('Validation Error', { email: ['Invalid email format'] }))
        }
      >
        Trigger Error
      </button>
      <button onClick={() => warning('Low Battery', 'System battery at 15%')}>
        Trigger Warning
      </button>
      <button onClick={() => info('System Update', 'Maintenance scheduled tonight')}>
        Trigger Info
      </button>
      <button onClick={() => clearAll()}>Clear All</button>
    </div>
  );
};

describe('Step A6.5 — Application Notification Infrastructure', () => {
  beforeEach(() => {
    act(() => {
      notificationService.clearAll();
    });
  });

  describe('1. Error Normalization Engine (formatNotificationError)', () => {
    it('normalizes ValidationError into clean title and field detail descriptions', () => {
      const err = new ValidationError('Bad Payload', {
        email: ['Must be a valid email'],
        name: ['Minimum length is 2 characters'],
      });

      const formatted = formatNotificationError(err);

      expect(formatted.title).toBe('Validation Failed');
      expect(formatted.description).toBe(
        'email: Must be a valid email; name: Minimum length is 2 characters',
      );
    });

    it('normalizes AuthenticationError into session expired message', () => {
      const err = new AuthenticationError();
      const formatted = formatNotificationError(err);

      expect(formatted.title).toBe('Authentication Session Expired');
      expect(formatted.description).toBe('Please log in again to continue.');
    });

    it('normalizes AuthorizationError into access denied message', () => {
      const err = new AuthorizationError();
      const formatted = formatNotificationError(err);

      expect(formatted.title).toBe('Access Denied');
      expect(formatted.description).toBe(
        'You do not possess permission to perform this operation.',
      );
    });

    it('normalizes NotFoundError, ConflictError, RateLimitError, and NetworkError', () => {
      expect(formatNotificationError(new NotFoundError('User not found'))).toEqual({
        title: 'Resource Not Found',
        description: 'User not found',
      });

      expect(formatNotificationError(new ConflictError('Email in use'))).toEqual({
        title: 'Resource Conflict',
        description: 'Email in use',
      });

      expect(formatNotificationError(new RateLimitError('Too many', 30))).toEqual({
        title: 'Rate Limit Exceeded',
        description: 'Please try again in 30 seconds.',
      });

      expect(formatNotificationError(new NetworkError())).toEqual({
        title: 'Network Connection Failure',
        description: 'Please check your internet connection and try again.',
      });
    });

    it('normalizes ServerError or raw Error into user-friendly message without stack leaks', () => {
      const rawError = new Error('SQLSTATE[HY000]: General error: 1366 Incorrect integer value');
      const formatted = formatNotificationError(rawError);

      expect(formatted.title).toBe('Operation Failed');
      expect(formatted.description).toBe('An unexpected server error occurred. Please try again.');
      expect(formatted.description).not.toContain('SQLSTATE');
    });

    it('handles raw string inputs as notification title', () => {
      const formatted = formatNotificationError('Direct Error Title');
      expect(formatted).toEqual({ title: 'Direct Error Title' });
    });
  });

  describe('2. Imperative NotificationService Dispatching', () => {
    it('dispatches success, error, warning, and info notifications via imperative singleton', () => {
      const listener = jest.fn();
      const unsubscribe = notificationService.subscribe(listener);

      notificationService.success('Success Action');
      notificationService.error('Error Action');
      notificationService.warning('Warning Action');
      notificationService.info('Info Action');

      expect(listener).toHaveBeenCalledTimes(4);
      expect(listener.mock.calls[0]?.[0]).toMatchObject({
        type: 'ADD',
        notification: expect.objectContaining({ type: 'success', title: 'Success Action' }),
      });

      unsubscribe();
    });
  });

  describe('3. React NotificationProvider & Toast UI Rendering', () => {
    it('renders ToastViewport and dispatches success notification to DOM', async () => {
      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>,
      );

      fireEvent.click(screen.getByText('Trigger Success'));

      expect(await screen.findByText('Profile Updated')).toBeInTheDocument();
      expect(screen.getByText('Your profile details were saved.')).toBeInTheDocument();
    });

    it('renders normalized error notification when triggering error button', async () => {
      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>,
      );

      fireEvent.click(screen.getByText('Trigger Error'));

      expect(await screen.findByText('Validation Failed')).toBeInTheDocument();
      expect(screen.getByText('email: Invalid email format')).toBeInTheDocument();
    });

    it('renders multiple simultaneous notifications in DOM', async () => {
      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>,
      );

      fireEvent.click(screen.getByText('Trigger Warning'));
      fireEvent.click(screen.getByText('Trigger Info'));

      expect(await screen.findByText('Low Battery')).toBeInTheDocument();
      expect(await screen.findByText('System Update')).toBeInTheDocument();
    });

    it('dismisses toast notification when close button is clicked', async () => {
      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>,
      );

      fireEvent.click(screen.getByText('Trigger Info'));

      const titleElement = await screen.findByText('System Update');
      expect(titleElement).toBeInTheDocument();

      const closeButton = screen.getByRole('button', { name: /close notification/i });
      fireEvent.click(closeButton);

      expect(screen.queryByText('System Update')).not.toBeInTheDocument();
    });

    it('clears all active notifications when clearAll is called', async () => {
      render(
        <NotificationProvider>
          <TestComponent />
        </NotificationProvider>,
      );

      fireEvent.click(screen.getByText('Trigger Success'));
      fireEvent.click(screen.getByText('Trigger Warning'));

      expect(await screen.findByText('Profile Updated')).toBeInTheDocument();
      expect(await screen.findByText('Low Battery')).toBeInTheDocument();

      fireEvent.click(screen.getByText('Clear All'));

      expect(screen.queryByText('Profile Updated')).not.toBeInTheDocument();
      expect(screen.queryByText('Low Battery')).not.toBeInTheDocument();
    });
  });
});
