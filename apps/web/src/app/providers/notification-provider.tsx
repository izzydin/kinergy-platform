import React, { createContext, useCallback, useContext, useState } from 'react';

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface NotificationMessage {
  id: string;
  type: NotificationType;
  title: string;
  description?: string;
}

export interface NotificationContextState {
  notifications: NotificationMessage[];
  addNotification: (notification: Omit<NotificationMessage, 'id'>) => void;
  removeNotification: (id: string) => void;
  /** Alias for addNotification matching Toast terminology */
  toast: (notification: Omit<NotificationMessage, 'id'>) => void;
}

const NotificationContext = createContext<NotificationContextState | undefined>(undefined);

export interface NotificationProviderProps {
  children: React.ReactNode;
}

/**
 * Notification Provider Component
 *
 * Ephemeral alert feedback channel for non-blocking notifications and mutation errors.
 */
export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [notifications, setNotifications] = useState<NotificationMessage[]>([]);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const addNotification = useCallback(
    (notification: Omit<NotificationMessage, 'id'>) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newNotification: NotificationMessage = { ...notification, id };

      setNotifications((prev) => [...prev, newNotification]);

      // Auto dismiss after 4 seconds
      setTimeout(() => {
        removeNotification(id);
      }, 4000);
    },
    [removeNotification],
  );

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        addNotification,
        removeNotification,
        toast: addNotification,
      }}
    >
      {children}
      {/* Ephemeral Notification Overlay Container */}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {notifications.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-4 shadow-xl backdrop-blur-lg transition-all ${
              item.type === 'error'
                ? 'border-destructive/40 bg-destructive/10 text-foreground'
                : item.type === 'success'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-foreground'
                  : item.type === 'warning'
                    ? 'border-amber-500/40 bg-amber-500/10 text-foreground'
                    : 'border-border bg-card/90 text-card-foreground'
            }`}
          >
            <div className="flex-1">
              <h4 className="font-semibold text-sm">{item.title}</h4>
              {item.description && (
                <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeNotification(item.id)}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
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
