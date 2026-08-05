import { Globe, Moon, Palette, Volume2 } from 'lucide-react';
import React from 'react';

/**
 * Mock General Settings View
 *
 * Presentation-only view used to validate tabbed layout navigation and breadcrumbs.
 */
export const GeneralSettingsView: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card/60 p-6 shadow-sm backdrop-blur-sm space-y-4">
        <h3 className="font-semibold text-lg text-foreground flex items-center gap-2">
          <Palette className="h-5 w-5 text-primary" />
          <span>System Preferences & Appearance</span>
        </h3>
        <p className="text-xs text-muted-foreground">
          Mock settings panel for validating component slot rendering and navigation state.
        </p>

        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-muted/20">
            <div className="flex items-center gap-3">
              <Moon className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-xs font-semibold block text-foreground">Theme Mode</span>
                <span className="text-[11px] text-muted-foreground">
                  System theme token provider
                </span>
              </div>
            </div>
            <span className="text-xs font-bold text-primary px-2.5 py-1 rounded-full bg-primary/10">
              Dark Mode (Active)
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-muted/20">
            <div className="flex items-center gap-3">
              <Globe className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-xs font-semibold block text-foreground">Default Locale</span>
                <span className="text-[11px] text-muted-foreground">
                  i18n LocaleProvider setting
                </span>
              </div>
            </div>
            <span className="text-xs font-bold text-foreground px-2.5 py-1 rounded-full bg-muted">
              English (US)
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-muted/20">
            <div className="flex items-center gap-3">
              <Volume2 className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-xs font-semibold block text-foreground">System Sounds</span>
                <span className="text-[11px] text-muted-foreground">Notification alerts</span>
              </div>
            </div>
            <span className="text-xs font-bold text-emerald-500 px-2.5 py-1 rounded-full bg-emerald-500/10">
              Enabled
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
