import { AlertTriangle, ArrowLeft, Lock, ShieldAlert } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';

/**
 * 404 Not Found View Component
 */
export const NotFoundView: React.FC<{ message?: string }> = ({
  message = 'The requested application view or resource does not exist.',
}) => {
  return (
    <div className="flex min-h-[450px] flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-500 shadow-inner">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <h2 className="font-extrabold text-3xl tracking-tight">404 — View Not Found</h2>
      <p className="mt-2 max-w-md text-muted-foreground text-sm">{message}</p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground text-sm shadow transition-colors hover:bg-primary/90"
      >
        <ArrowLeft className="h-4 w-4" /> Return to Overview
      </Link>
    </div>
  );
};

/**
 * 403 Forbidden Access Denied View Component
 */
export const ForbiddenView: React.FC<{ message?: string }> = ({
  message = 'You do not possess the required security permissions to access this feature view.',
}) => {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex min-h-[450px] flex-col items-center justify-center p-8 text-center"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive shadow-inner">
        <ShieldAlert className="h-8 w-8" />
      </div>
      <h2 className="font-extrabold text-3xl tracking-tight text-destructive">
        403 — Access Denied
      </h2>
      <p className="mt-2 max-w-md text-muted-foreground text-sm">{message}</p>
      <Link
        to="/"
        className="mt-6 inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 font-medium text-foreground text-sm transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" /> Return to Dashboard
      </Link>
    </div>
  );
};

/**
 * 401 Unauthenticated Session View Component
 */
export const UnauthenticatedView: React.FC<{ message?: string }> = ({
  message = 'Your authentication session has expired. Please log in again to continue.',
}) => {
  return (
    <div
      role="alert"
      aria-live="polite"
      className="flex min-h-[450px] flex-col items-center justify-center p-8 text-center"
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-inner">
        <Lock className="h-8 w-8" />
      </div>
      <h2 className="font-extrabold text-3xl tracking-tight">401 — Session Expired</h2>
      <p className="mt-2 max-w-md text-muted-foreground text-sm">{message}</p>
      <Link
        to="/auth/login"
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground text-sm shadow transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      >
        Log In Again
      </Link>
    </div>
  );
};

/**
 * Routing Infrastructure Placeholder View
 */
export const PlaceholderView: React.FC<{ title: string; subtitle?: string }> = ({
  title,
  subtitle = 'Routing Infrastructure Placeholder Boundary',
}) => {
  return (
    <div className="flex min-h-[350px] flex-col items-center justify-center rounded-xl border border-dashed border-border p-8 text-center">
      <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 font-medium text-primary text-xs">
        Routing Infrastructure Active
      </div>
      <h3 className="mt-4 font-bold text-2xl tracking-tight">{title}</h3>
      <p className="mt-2 max-w-lg text-muted-foreground text-sm">{subtitle}</p>
    </div>
  );
};
