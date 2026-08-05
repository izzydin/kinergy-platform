import React from 'react';

/**
 * Standard predefined application layout slot targets.
 * Ensures type safety for core shell insertion points while allowing custom string extension slots.
 */
export type KnownSlotTarget =
  | 'header-breadcrumbs'
  | 'header-actions'
  | 'header-search'
  | 'page-toolbar'
  | 'page-tabs'
  | 'page-status'
  | 'footer-actions'
  | 'sidebar-footer';

export type SlotTargetName = KnownSlotTarget | (string & {});

export interface SlotContextValue {
  /** Map of active slot target DOM elements indexed by target name */
  targets: Record<string, HTMLElement | null>;
  /** Map of active injection counts targeting each slot name */
  injectionCounts: Record<string, number>;
  /** Registers a DOM element target for a slot name */
  registerTarget: (name: SlotTargetName, element: HTMLElement | null) => void;
  /** Unregisters a DOM element target for a slot name */
  unregisterTarget: (name: SlotTargetName) => void;
  /** Registers an active injection count for a target slot, returning cleanup function */
  registerInjection: (name: SlotTargetName) => () => void;
}

export interface SlotProviderProps {
  children: React.ReactNode;
}

export interface SlotTargetProps {
  /** Name identifier of the slot target */
  name: SlotTargetName;
  /** Fallback content rendered when no feature module injects into this slot */
  fallback?: React.ReactNode;
  /** Outer container DOM element tag (defaults to 'div') */
  as?: React.ElementType;
  /** Additional CSS class names */
  className?: string;
  /** Children fallback if fallback prop is not provided */
  children?: React.ReactNode;
}

export interface SlotInjectProps {
  /** Name identifier of the target slot where children should be projected */
  target: SlotTargetName;
  /** React node elements to project into the target slot */
  children: React.ReactNode;
}
