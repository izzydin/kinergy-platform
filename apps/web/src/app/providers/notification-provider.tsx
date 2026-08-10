import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastTitle,
  ToastViewport,
} from '@kinergy-platform/ui';

import {
  ApiError,
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NetworkError,
  NotFoundError,
  RateLimitError,
  RequestCanceledError,
  ValidationError,
  normalizeApiError,
} from '../../shared/api';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface NotificationMessage {
  id: string;
  type: NotificationType;
  title: string;
  description?: string;
  durationMs?: number;
}

export interface NotificationOptions {
  description?: string;
  durationMs?: number;
}

/**
 * Transforms raw error objects (ApiError, ValidationError, AuthenticationError, etc.)
 * into user-friendly notification title and description pairs.
 * Never exposes raw stack traces, database credentials, or sensitive server internals.
 */
export function formatNotificationError(errorOrTitle: unknown): {
  title: string;
  description?: string;
} {
  if (typeof errorOrTitle === 'string') {
    return { title: errorOrTitle };
  }

  const normalized: ApiError = normalizeApiError(errorOrTitle);

  if (normalized instanceof ValidationError) {
    let description: string | undefined;
    if (normalized.details && Object.keys(normalized.details).length > 0) {
      const fieldErrors = Object.entries(normalized.details)
        .map(([field, errs]) => `${field}: ${errs.join(', ')}`)
        .join('; ');
      description = fieldErrors;
    } else {
      description = normalized.message;
    }
    return {
      title: 'Validation Failed',
      description,
    };
  }

  if (normalized instanceof AuthenticationError) {
    return {
      title: 'Authentication Session Expired',
      description: 'Please log in again to continue.',
    };
  }

  if (normalized instanceof AuthorizationError) {
    return {
      title: 'Access Denied',
      description: 'You do not possess permission to perform this operation.',
    };
  }

  if (normalized instanceof NotFoundError) {
    return {
      title: 'Resource Not Found',
      description: normalized.message,
    };
  }

  if (normalized instanceof ConflictError) {
    return {
      title: 'Resource Conflict',
      description: normalized.message,
    };
  }

  if (normalized instanceof RateLimitError) {
    return {
      title: 'Rate Limit Exceeded',
      description: normalized.retryAfterSeconds
        ? `Please try again in ${normalized.retryAfterSeconds} seconds.`
        : 'Please slow down and try again later.',
    };
  }

  if (normalized instanceof NetworkError) {
    return {
      title: 'Network Connection Failure',
      description: 'Please check your internet connection and try again.',
    };
  }

  if (normalized instanceof RequestCanceledError) {
    return {
      title: 'Request Canceled',
      description: 'The operation was canceled.',
    };
  }

  return {
    title: 'Operation Failed',
    description: 'An unexpected server error occurred. Please try again.',
  };
}

export type NotificationAction =
  | { type: 'ADD'; notification: NotificationMessage }
  | { type: 'REMOVE'; id: string }
  | { type: 'CLEAR' };

export type NotificationListener = (action: NotificationAction) => void;

/**
 * Imperative Application Notification Service (`NotificationService`)
 * Allows non-React application infrastructure and feature modules to dispatch user notifications.
 */
export class NotificationService {
  private readonly listeners = new Set<NotificationListener>();

  subscribe(listener: NotificationListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  success(title: string, description?: string, durationMs = 4000): string {
    return this.add('success', title, description, durationMs);
  }

  error(errorOrTitle: unknown, description?: string, durationMs = 5000): string {
    const formatted = formatNotificationError(errorOrTitle);
    return this.add('error', formatted.title, description ?? formatted.description, durationMs);
  }

  warning(title: string, description?: string, durationMs = 4000): string {
    return this.add('warning', title, description, durationMs);
  }

  info(title: string, description?: string, durationMs = 4000): string {
    return this.add('info', title, description, durationMs);
  }

  dismiss(id: string): void {
    this.emit({ type: 'REMOVE', id });
  }

  clearAll(): void {
    this.emit({ type: 'CLEAR' });
  }

  private add(
    type: NotificationType,
    title: string,
    description?: string,
    durationMs = 4000,
  ): string {
    const id = `notif_${Math.random().toString(36).substring(2, 9)}`;
    const notification: NotificationMessage = {
      id,
      type,
      title,
      description,
      durationMs,
    };
    this.emit({ type: 'ADD', notification });
    return id;
  }

  private emit(action: NotificationAction): void {
    for (const listener of this.listeners) {
      try {
        listener(action);
      } catch {
        // Prevent subscriber errors from crashing caller
      }
    }
  }
}

/** Shared singleton instance of NotificationService */
export const notificationService = new NotificationService();
/** Alias for notificationService */
export const notify = notificationService;

export interface NotificationContextState {
  notifications: readonly NotificationMessage[];
  notify: NotificationService;
  success: (title: string, description?: string, durationMs?: number) => string;
  error: (errorOrTitle: unknown, description?: string, durationMs?: number) => string;
  warning: (title: string, description?: string, durationMs?: number) => string;
  info: (title: string, description?: string, durationMs?: number) => string;
  dismiss: (id: string) => void;
  clearAll: () => void;
  addNotification: (notification: Omit<NotificationMessage, 'id'>) => void;
  removeNotification: (id: string) => void;
  toast: (notification: Omit<NotificationMessage, 'id'>) => void;
}

const NotificationContext = createContext<NotificationContextState | undefined>(undefined);

export interface NotificationProviderProps {
  children: React.ReactNode;
}

/**
 * Application Notification Provider Component (`apps/web/src/app/providers/notification-provider.tsx`)
 *
 * Consumes Design System Toast UI primitives (`@kinergy-platform/ui`) and binds
 * state to the central `notificationService`.
 */
export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [notifications, setNotifications] = useState<NotificationMessage[]>([]);

  useEffect(() => {
    const unsubscribe = notificationService.subscribe((action) => {
      if (action.type === 'ADD') {
        const notif = action.notification;
        setNotifications((prev) => [...prev, notif]);

        if (notif.durationMs && notif.durationMs > 0) {
          setTimeout(() => {
            setNotifications((prev) => prev.filter((item) => item.id !== notif.id));
          }, notif.durationMs);
        }
      } else if (action.type === 'REMOVE') {
        setNotifications((prev) => prev.filter((item) => item.id !== action.id));
      } else if (action.type === 'CLEAR') {
        setNotifications([]);
      }
    });

    return unsubscribe;
  }, []);

  const dismiss = useCallback((id: string) => {
    notificationService.dismiss(id);
  }, []);

  const clearAll = useCallback(() => {
    notificationService.clearAll();
  }, []);

  const success = useCallback((title: string, description?: string, durationMs?: number) => {
    return notificationService.success(title, description, durationMs);
  }, []);

  const error = useCallback((errorOrTitle: unknown, description?: string, durationMs?: number) => {
    return notificationService.error(errorOrTitle, description, durationMs);
  }, []);

  const warning = useCallback((title: string, description?: string, durationMs?: number) => {
    return notificationService.warning(title, description, durationMs);
  }, []);

  const info = useCallback((title: string, description?: string, durationMs?: number) => {
    return notificationService.info(title, description, durationMs);
  }, []);

  const addNotification = useCallback((notif: Omit<NotificationMessage, 'id'>) => {
    if (notif.type === 'error') {
      notificationService.error(notif.title, notif.description);
    } else if (notif.type === 'success') {
      notificationService.success(notif.title, notif.description);
    } else if (notif.type === 'warning') {
      notificationService.warning(notif.title, notif.description);
    } else {
      notificationService.info(notif.title, notif.description);
    }
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        notify: notificationService,
        success,
        error,
        warning,
        info,
        dismiss,
        clearAll,
        addNotification,
        removeNotification: dismiss,
        toast: addNotification,
      }}
    >
      {children}
      {/* Viewport Overlay consuming Design System Toast primitives */}
      <ToastViewport aria-label="Application Feedback Notifications">
        {notifications.map((item) => (
          <Toast
            key={item.id}
            variant={
              item.type === 'error'
                ? 'destructive'
                : item.type === 'success'
                  ? 'success'
                  : item.type === 'warning'
                    ? 'warning'
                    : 'default'
            }
          >
            <div className="grid gap-1">
              <ToastTitle>{item.title}</ToastTitle>
              {item.description && <ToastDescription>{item.description}</ToastDescription>}
            </div>
            <ToastClose onClick={() => dismiss(item.id)} />
          </Toast>
        ))}
      </ToastViewport>
    </NotificationContext.Provider>
  );
};

export const useNotification = (): NotificationContextState => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

/** Alias for ToastProvider backwards compatibility */
export const ToastProvider = NotificationProvider;
/** Alias for useToast backwards compatibility */
export const useToast = useNotification;
