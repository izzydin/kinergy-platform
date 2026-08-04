import { Zap } from 'lucide-react';
import React from 'react';
import { Outlet } from 'react-router-dom';

/**
 * AuthLayout Shell
 *
 * Public & Authentication Layout Wrapper.
 * Provides a centered, glassmorphic layout container for login, password reset, and public views.
 */
export const AuthLayout: React.FC = () => {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4 text-foreground">
      {/* Top Branding Logo */}
      <div className="mb-8 flex items-center gap-3 font-bold text-2xl tracking-tight">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
          <Zap className="h-6 w-6" />
        </div>
        <span className="bg-gradient-to-r from-primary via-blue-400 to-indigo-400 bg-clip-text text-transparent">
          Kinergy Platform
        </span>
      </div>

      {/* Main Outlet Container */}
      <main className="w-full max-w-md rounded-2xl border border-border/60 bg-card/80 p-8 shadow-2xl backdrop-blur-xl">
        <Outlet />
      </main>

      {/* Footer Branding */}
      <footer className="mt-8 text-center text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} Kinergy Platform. Enterprise Energy Infrastructure.
      </footer>
    </div>
  );
};
