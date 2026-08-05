import React, { createContext, useCallback, useMemo, useState } from 'react';
import type { SlotContextValue, SlotProviderProps, SlotTargetName } from './slot.types';

export const SlotContext = createContext<SlotContextValue | undefined>(undefined);

/**
 * Slot Provider Component
 *
 * Provides the React Context environment for declarative layout slot injection using React Portals.
 * Maintains DOM node references for SlotTargets and active injection counts for fallback visibility.
 */
export const SlotProvider: React.FC<SlotProviderProps> = ({ children }) => {
  const [targets, setTargets] = useState<Record<string, HTMLElement | null>>({});
  const [injectionCounts, setInjectionCounts] = useState<Record<string, number>>({});

  const registerTarget = useCallback((name: SlotTargetName, element: HTMLElement | null) => {
    setTargets((prev) => {
      if (prev[name] === element) return prev;
      return { ...prev, [name]: element };
    });
  }, []);

  const unregisterTarget = useCallback((name: SlotTargetName) => {
    setTargets((prev) => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const registerInjection = useCallback((name: SlotTargetName) => {
    setInjectionCounts((prev) => ({
      ...prev,
      [name]: (prev[name] || 0) + 1,
    }));

    return () => {
      setInjectionCounts((prev) => {
        const count = (prev[name] || 0) - 1;
        if (count <= 0) {
          const next = { ...prev };
          delete next[name];
          return next;
        }
        return { ...prev, [name]: count };
      });
    };
  }, []);

  const value = useMemo<SlotContextValue>(
    () => ({
      targets,
      injectionCounts,
      registerTarget,
      unregisterTarget,
      registerInjection,
    }),
    [targets, injectionCounts, registerTarget, unregisterTarget, registerInjection],
  );

  return <SlotContext.Provider value={value}>{children}</SlotContext.Provider>;
};
