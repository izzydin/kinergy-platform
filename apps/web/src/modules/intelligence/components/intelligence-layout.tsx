import React from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Bot, BookOpen, Sparkles } from 'lucide-react';
import { AIHealthPill } from './ai-health-pill';
import { IntelligenceErrorBoundary } from './intelligence-error-boundary';
import { useOptionalAuth } from '../../../app/providers/auth-provider';
import { canAccessKnowledgeCenter } from '../routes/intelligence-knowledge-guard';

export interface IntelligenceLayoutProps {
  children?: React.ReactNode;
}

/**
 * Shared Layout Shell for the Kynergy Intelligence Feature Module.
 *
 * Architecture Invariants:
 * 1. Single Application Shell: Embeds natively within DashboardLayout without duplicating
 *    the global sidebar, header, or user menu.
 * 2. Viewport-Adaptive Container: Pins outer height to available viewport space
 *    (`h-[calc(100vh-theme(spacing.28))] md:h-[calc(100vh-theme(spacing.24))]`),
 *    preventing double scrollbars.
 * 3. Future Chat Compatibility: Provides a flex-1 min-h-0 main container allowing
 *    conversational workspaces to anchor message composers and handle inner message scrolling.
 * 4. Semantic Landmarks: Accessible role="region", role="banner", role="navigation", and role="main".
 * 5. Permission-Aware Navigation: Subnavigation tabs respect user authorization, hiding Knowledge Center
 *    from unauthorized roles without exposing inaccessible action targets.
 * 6. Responsive Foundations: Strictly avoids horizontal overflow (`overflow-x-hidden`),
 *    supports viewport scaling at 360px, 390px, 768px, 1280px, 1440px+, and accommodates browser zoom.
 */
export const IntelligenceLayout: React.FC<IntelligenceLayoutProps> = ({ children }) => {
  const location = useLocation();
  const auth = useOptionalAuth();

  // Evaluate Knowledge Center access via shared authorization utility
  // Defaults to true when rendered without AuthProvider in standalone layout tests
  const canAccessKnowledge = auth ? canAccessKnowledgeCenter(auth.currentUser, auth.hasRole) : true;

  // Active route matching: supports index redirect (/intelligence) and nested subroutes
  const isChatActive =
    location.pathname === '/intelligence' || location.pathname.startsWith('/intelligence/chat');
  const isKnowledgeActive = location.pathname.startsWith('/intelligence/knowledge');

  return (
    <IntelligenceErrorBoundary>
      <div
        role="region"
        aria-label="Espacio de Trabajo Kynergy Intelligence"
        data-testid="intelligence-layout"
        className="flex h-[calc(100vh-theme(spacing.28))] md:h-[calc(100vh-theme(spacing.24))] flex-col rounded-xl border border-border/40 bg-card/30 shadow-xs overflow-hidden overflow-x-hidden transition-colors"
      >
        {/* Module Header Bar */}
        <header
          role="banner"
          className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border/50 bg-card/60 px-4 py-3 md:px-6 md:py-3.5 backdrop-blur-md min-w-0"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary shadow-xs">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <h1 className="text-base font-bold tracking-tight text-foreground truncate">
                  Kynergy Intelligence
                </h1>
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground uppercase shrink-0">
                  v1.0
                </span>
              </div>
              <p className="hidden text-xs text-muted-foreground sm:block truncate">
                Asistencia conversacional fundamentada y centro de documentación clínica
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <AIHealthPill />
          </div>
        </header>

        {/* Tab Navigation Row */}
        <nav
          aria-label="Subsecciones de Inteligencia"
          className="flex shrink-0 items-center gap-2 border-b border-border/40 bg-card/20 px-4 md:px-6 overflow-x-auto scrollbar-none"
        >
          <NavLink
            to="/intelligence/chat"
            aria-label="AI Assistant — Chat Asistente"
            className={`inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 ${
              isChatActive
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
            }`}
          >
            <Bot className="h-4 w-4 shrink-0" />
            <span>Chat Asistente</span>
          </NavLink>

          {canAccessKnowledge && (
            <NavLink
              to="/intelligence/knowledge"
              aria-label="Knowledge Center — Base de Conocimiento"
              className={`inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0 ${
                isKnowledgeActive
                  ? 'border-primary text-primary font-semibold'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
              }`}
            >
              <BookOpen className="h-4 w-4 shrink-0" />
              <span>Base de Conocimiento</span>
            </NavLink>
          )}
        </nav>

        {/* Main Content Region: flex-1 min-h-0 overflow-hidden supports full-height chat workspaces */}
        <main
          role="main"
          className="flex-1 min-h-0 flex flex-col p-4 md:p-6 overflow-hidden overflow-x-hidden min-w-0"
        >
          {children || <Outlet />}
        </main>
      </div>
    </IntelligenceErrorBoundary>
  );
};
