import React, { Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { moduleRegistry } from '../../../app/routes/module-registry';
import { NotFoundView } from '../../../app/routes/fallback-views';
import { lazyWithRetry, SuspenseFallback } from '../../../app/routes/lazy-loading';

const RoomsPage = lazyWithRetry(() =>
  import('./rooms-page').then((m) => ({ default: m.RoomsPage })),
);

export const RoomsSubRouter: React.FC = () => (
  <Suspense fallback={<SuspenseFallback label="Loading Room Directory..." />}>
    <Routes>
      <Route path="/" element={<RoomsPage />} />
      <Route path="*" element={<NotFoundView message="Room view not found." />} />
    </Routes>
  </Suspense>
);

// Register Rooms module with central hybrid app router at /rooms
moduleRegistry.register({
  id: 'rooms',
  prefix: '/rooms',
  title: 'Room Management & Directory',
  isProtected: true,
  requiredPermissions: ['settings.read'],
  component: RoomsSubRouter,
});
