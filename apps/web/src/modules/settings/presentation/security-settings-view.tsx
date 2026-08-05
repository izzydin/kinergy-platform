import { Key, Lock, ShieldAlert, UserCheck } from 'lucide-react';
import React from 'react';

/**
 * Mock Security Settings View
 *
 * Presentation-only view used to validate security route boundaries & breadcrumb metadata.
 */
export const SecuritySettingsView: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/60 bg-card/60 p-6 shadow-sm backdrop-blur-sm space-y-4">
        <h3 className="font-semibold text-lg text-foreground flex items-center gap-2">
          <Lock className="h-5 w-5 text-amber-500" />
          <span>Security & Authentication Settings</span>
        </h3>
        <p className="text-xs text-muted-foreground">
          Mock security settings panel for validating nested sub-route metadata
          (`/settings/security`).
        </p>

        <div className="space-y-3 pt-2">
          <div className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-muted/20">
            <div className="flex items-center gap-3">
              <UserCheck className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-xs font-semibold block text-foreground">
                  Multi-Factor Authentication
                </span>
                <span className="text-[11px] text-muted-foreground">TOTP Authenticator app</span>
              </div>
            </div>
            <span className="text-xs font-bold text-emerald-500 px-2.5 py-1 rounded-full bg-emerald-500/10">
              Enforced
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-muted/20">
            <div className="flex items-center gap-3">
              <Key className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-xs font-semibold block text-foreground">Active Sessions</span>
                <span className="text-[11px] text-muted-foreground">
                  JWT Refresh Token rotation
                </span>
              </div>
            </div>
            <span className="text-xs font-bold text-foreground px-2.5 py-1 rounded-full bg-muted">
              1 Active Session
            </span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-border/40 bg-muted/20">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-xs font-semibold block text-foreground">
                  Security Audit Logs
                </span>
                <span className="text-[11px] text-muted-foreground">Platform security logger</span>
              </div>
            </div>
            <span className="text-xs font-bold text-blue-500 px-2.5 py-1 rounded-full bg-blue-500/10">
              Active Monitoring
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
