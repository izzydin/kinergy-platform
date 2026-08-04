import React, { createContext, useContext, useState } from 'react';

export type FeatureFlagMap = Record<string, boolean>;

export interface FeatureFlagContextState {
  flags: FeatureFlagMap;
  isEnabled: (flagName: string) => boolean;
  setFlag: (flagName: string, enabled: boolean) => void;
}

const defaultFlags: FeatureFlagMap = {
  ENABLE_TELEMETRY: true,
  ENABLE_ADVANCED_ANALYTICS: true,
  ENABLE_MULTI_TENANT_SWITCHER: false,
};

const FeatureFlagContext = createContext<FeatureFlagContextState | undefined>(undefined);

export interface FeatureFlagProviderProps {
  children: React.ReactNode;
  initialFlags?: FeatureFlagMap;
}

/**
 * Feature Flags Provider Placeholder Component
 *
 * Infrastructure placeholder for future SaaS tier feature flag evaluation and runtime toggles.
 */
export const FeatureFlagProvider: React.FC<FeatureFlagProviderProps> = ({
  children,
  initialFlags = defaultFlags,
}) => {
  const [flags, setFlags] = useState<FeatureFlagMap>(initialFlags);

  const isEnabled = (flagName: string): boolean => {
    return flags[flagName] ?? false;
  };

  const setFlag = (flagName: string, enabled: boolean): void => {
    setFlags((prev) => ({ ...prev, [flagName]: enabled }));
  };

  return (
    <FeatureFlagContext.Provider value={{ flags, isEnabled, setFlag }}>
      {children}
    </FeatureFlagContext.Provider>
  );
};

export const useFeatureFlags = (): FeatureFlagContextState => {
  const context = useContext(FeatureFlagContext);
  if (!context) {
    throw new Error('useFeatureFlags must be used within a FeatureFlagProvider');
  }
  return context;
};
