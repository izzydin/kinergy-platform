import React, { useCallback, useEffect, useRef } from 'react';
import type { SlotTargetProps } from './slot.types';
import { useSlot } from './useSlot';

/**
 * SlotTarget Component
 *
 * Defines an insertion point inside layout shells for declarative UI projection.
 * Displays fallback content when no feature modules inject content into this slot.
 */
export const SlotTarget: React.FC<SlotTargetProps> = ({
  name,
  fallback,
  as: Component = 'div',
  className = '',
  children,
}) => {
  const { registerTarget, unregisterTarget, injectionCounts } = useSlot();
  const elementRef = useRef<HTMLElement | null>(null);

  const setRef = useCallback(
    (node: HTMLElement | null) => {
      elementRef.current = node;
      registerTarget(name, node);
    },
    [name, registerTarget],
  );

  useEffect(() => {
    return () => {
      unregisterTarget(name);
    };
  }, [name, unregisterTarget]);

  const hasInjections = (injectionCounts[name] || 0) > 0;
  const fallbackContent = fallback ?? children;

  return (
    <Component
      ref={setRef}
      data-slot-target={name}
      className={`slot-target slot-target-${name} ${className}`}
    >
      {!hasInjections && fallbackContent}
    </Component>
  );
};
