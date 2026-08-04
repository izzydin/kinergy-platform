import type { NavigationItem } from '../navigation/navigation.types';
import type { BreadcrumbItem, RouteBreadcrumbHandle } from './breadcrumb.types';

export interface RouteMatchLike {
  pathname: string;
  params: Record<string, string | undefined>;
  handle?: unknown;
}

export interface GeneratorOptions {
  pathname: string;
  matches?: RouteMatchLike[];
  navigationItems?: NavigationItem[];
  homeLabel?: string;
  homePath?: string;
}

/**
 * Breadcrumb Generator Engine
 *
 * Automatically generates structured breadcrumb paths from:
 * 1. React Router `matches` with route `handle.breadcrumb` metadata.
 * 2. Navigation Framework item configurations registered in `navigationRegistry`.
 * 3. URL path hierarchy fallback with formatted segment labels.
 *
 * Eliminates manual, imperative breadcrumb definitions inside page views.
 */
export class BreadcrumbGenerator {
  /**
   * Generate an ordered list of BreadcrumbItems for the given route location
   */
  public static generate(options: GeneratorOptions): BreadcrumbItem[] {
    const {
      pathname,
      matches = [],
      navigationItems = [],
      homeLabel = 'Dashboard',
      homePath = '/',
    } = options;

    const breadcrumbs: BreadcrumbItem[] = [];

    // Root Home / Dashboard baseline item
    const homeNavMatch = navigationItems.find((item) => item.path === homePath);
    breadcrumbs.push({
      id: 'root-home',
      label: homeNavMatch?.label || homeLabel,
      path: homePath,
      isCurrent: pathname === homePath,
      icon: homeNavMatch?.icon,
    });

    if (pathname === homePath) {
      return breadcrumbs;
    }

    // Strategy A: Check React Router matches for route handle metadata
    const handleMatches = matches.filter(
      (m) => m.handle && typeof (m.handle as RouteBreadcrumbHandle).breadcrumb !== 'undefined',
    );

    if (handleMatches.length > 0) {
      handleMatches.forEach((m) => {
        const handle = m.handle as RouteBreadcrumbHandle;
        const label =
          typeof handle.breadcrumb === 'function'
            ? handle.breadcrumb(m.params || {})
            : String(handle.breadcrumb);

        breadcrumbs.push({
          id: `match-${m.pathname}`,
          label,
          path: m.pathname,
          isCurrent: m.pathname === pathname,
          icon: handle.icon,
        });
      });

      // Update isCurrent flags
      const lastIndex = breadcrumbs.length - 1;
      return breadcrumbs.map((item, index) => ({
        ...item,
        isCurrent: index === lastIndex,
      }));
    }

    // Strategy B: Fallback path hierarchy segment resolution via Navigation items & path formatting
    const rawSegments = pathname.split('/').filter(Boolean);
    let accumulatedPath = '';

    rawSegments.forEach((segment, index) => {
      accumulatedPath += `/${segment}`;
      const isCurrent = index === rawSegments.length - 1;

      // Look up label from Navigation Framework configuration
      const matchedNavItem = navigationItems.find((item) => item.path === accumulatedPath);

      let label = matchedNavItem?.label;
      if (!label) {
        // Humanize path segment (e.g. 'client-profiles' -> 'Client Profiles', '123' -> '#123')
        label = this.humanizeSegment(segment);
      }

      breadcrumbs.push({
        id: `path-${accumulatedPath}`,
        label,
        path: accumulatedPath,
        isCurrent,
        icon: matchedNavItem?.icon,
      });
    });

    return breadcrumbs;
  }

  /**
   * Helper to convert URL path segments into human-readable labels
   */
  private static humanizeSegment(segment: string): string {
    // ID-like numeric or UUID segment fallback
    if (/^\d+$/.test(segment)) {
      return `#${segment}`;
    }
    if (/^[0-9a-fA-F-]{16,}$/.test(segment)) {
      return `#${segment.slice(0, 8)}`;
    }

    return segment.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
  }
}
