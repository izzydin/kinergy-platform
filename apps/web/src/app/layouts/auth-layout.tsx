import { Zap } from 'lucide-react';
import React from 'react';
import { Outlet } from 'react-router-dom';

export interface AuthLayoutProps {
  children?: React.ReactNode;
  /** Extension point: Custom header branding slot */
  header?: React.ReactNode;
  /** Extension point: Custom footer links slot */
  footer?: React.ReactNode;
}

/**
 * AuthLayout Shell Component
 *
 * Public & Authentication Layout Wrapper.
 * Provides a centered, glassmorphic layout container for login, password reset, and public workflow views.
 *
 * Responsibilities:
 * - Centered viewport composition & backdrop blur styling
 * - Exposes stable extension points for Branding Header, Card Content, and Footer links
 * - Zero business logic
 * - Zero authentication checking
 */
export const AuthLayout: React.FC<AuthLayoutProps> = ({ children, header, footer }) => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground">
      {/* Branding Header Extension Point */}
      <div className="mb-8 flex items-center gap-3 font-bold text-2xl tracking-tight">
        {header || (
          <>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
              <Zap className="h-6 w-6" />
            </div>
            <span className="bg-gradient-to-r from-primary via-blue-400 to-indigo-400 bg-clip-text text-transparent">
              Kinergy Platform
            </span>
          </>
        )}
      </div>

      {/* Main Form Content Extension Point */}
      <main className="w-full max-w-md rounded-2xl border border-border/60 bg-card/80 p-8 shadow-2xl backdrop-blur-xl">
        {children || <Outlet />}
      </main>

      {/* Footer Links Extension Point */}
      <footer className="mt-8 text-center text-xs text-muted-foreground">
        {footer || (
          <>&copy; {new Date().getFullYear()} Kinergy Platform. Enterprise Energy Infrastructure.</>
        )}
      </footer>
    </div>
  );
};
