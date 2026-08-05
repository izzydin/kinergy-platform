import React, { useEffect, useLayoutEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import type { SlotInjectProps } from './slot.types';
import { useSlot } from './useSlot';

const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/**
 * SlotInject Component
 *
 * Declaratively projects React elements into a predefined layout `SlotTarget` using React Portals.
 * Preserves local React state, context, callbacks, refs, hooks, and error boundaries.
 */
export const SlotInject: React.FC<SlotInjectProps> = ({ target, children }) => {
  const { targets, registerInjection } = useSlot();
  const [, setTick] = useState(0);

  const targetElement =
    targets[target] ||
    (typeof document !== 'undefined'
      ? (document.querySelector(`[data-slot-target="${target}"]`) as HTMLElement | null)
      : null);

  useIsomorphicLayoutEffect(() => {
    const unregister = registerInjection(target);
    if (!targets[target]) {
      setTick((prev) => prev + 1);
    }
    return unregister;
  }, [target, registerInjection, targets]);

  if (!targetElement) {
    return null;
  }

  return ReactDOM.createPortal(children, targetElement);
};
