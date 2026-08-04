import { MainLayout } from '@app/layouts/main-layout';
import React from 'react';
import { Route, Routes } from 'react-router-dom';

const WelcomeView: React.FC = () => {
  return (
    <div className="container flex flex-col items-center justify-center gap-6 py-24 text-center">
      <div className="inline-flex items-center rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
        Nx Monorepo Ready
      </div>
      <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl">
        Enterprise Energy Management Baseline
      </h1>
      <p className="max-w-[42rem] leading-normal text-muted-foreground sm:text-xl sm:leading-8">
        Clean Architecture, Domain-Driven Design, TanStack Query, React Router, and Tailwind CSS
        scaffolded cleanly.
      </p>
    </div>
  );
};

const NotFoundView: React.FC = () => {
  return (
    <div className="container flex flex-col items-center justify-center gap-4 py-24 text-center">
      <h2 className="text-3xl font-bold">404 - Page Not Found</h2>
      <p className="text-muted-foreground">The requested view does not exist.</p>
    </div>
  );
};

export const AppRouter: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<MainLayout />}>
        <Route index element={<WelcomeView />} />
        <Route path="*" element={<NotFoundView />} />
      </Route>
    </Routes>
  );
};
