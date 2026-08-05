import { useContext } from 'react';
import { SlotContext } from './SlotProvider';
import type { SlotContextValue } from './slot.types';

/**
 * Custom hook to access Slot Context state and target methods.
 */
export const useSlot = (): SlotContextValue => {
  const context = useContext(SlotContext);
  if (!context) {
    throw new Error('useSlot must be used within a SlotProvider');
  }
  return context;
};
