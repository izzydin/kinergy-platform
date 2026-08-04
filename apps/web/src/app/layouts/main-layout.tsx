import { Zap } from 'lucide-react';
import React from 'react';
import { Outlet } from 'react-router-dom';

export const MainLayout: React.FC = () => {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl tracking-tight">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow">
              <Zap className="h-5 w-5" />
            </div>
            <span className="bg-gradient-to-r from-primary to-blue-400 bg-clip-text text-transparent">
              Kinergy Platform
            </span>
          </div>
          <nav className="flex items-center gap-6 text-sm font-medium">
            <span className="text-muted-foreground transition-colors hover:text-foreground">
              Overview
            </span>
            <span className="text-muted-foreground transition-colors hover:text-foreground">
              Documentation
            </span>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-border/40 py-6">
        <div className="container flex flex-col items-center justify-between gap-4 md:h-12 md:flex-row md:py-0">
          <p className="text-center text-sm text-muted-foreground md:text-left">
            &copy; {new Date().getFullYear()} Kinergy Platform. Enterprise Energy System.
          </p>
        </div>
      </footer>
    </div>
  );
};
