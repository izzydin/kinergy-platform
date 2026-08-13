export { AppRouter } from './app-router';
export {
  ForbiddenView,
  NotFoundView,
  PlaceholderView,
  UnauthenticatedView,
} from './fallback-views';
export { LazyView, SuspenseFallback, withLazy } from './lazy-loading';
export { moduleRegistry, type ModuleRouteDefinition } from './module-registry';
export {
  HasPermission,
  RequirePermission,
  type HasPermissionProps,
  type RequirePermissionProps,
} from './permission-guard';
export {
  ProtectedRoute,
  type ProtectedRouteProps,
  type AuthUser,
  type UserSession,
} from './protected-route';
export { ProtectedRouter } from './protected-router';
export { PublicRoute, type PublicRouteProps } from './public-route';
export { PublicRouter } from './public-router';
