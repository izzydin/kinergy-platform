import type { NavigationItem, NavigationSection } from './navigation.types';

export interface NavigationBuilderOptions {
  items: NavigationItem[];
  hasPermission?: (permission: string) => boolean;
  hasTenantFeature?: (featureFlag: string) => boolean;
  sectionTitles?: Record<string, string>;
}

/**
 * Navigation Tree Builder Engine
 *
 * Evaluates permission boundaries, multi-tenant feature flags, sorts items by weight,
 * and groups authorized navigation items into rendering-ready NavigationSections.
 */
export class NavigationBuilder {
  /**
   * Filters and builds authorized navigation items and sections.
   */
  public static build(options: NavigationBuilderOptions): NavigationSection[] {
    const {
      items,
      hasPermission = () => true,
      hasTenantFeature = () => true,
      sectionTitles = {
        overview: 'Overview',
        core: 'Core Operations',
        admin: 'Administration',
        system: 'System Settings',
      },
    } = options;

    // 1. Filter items by permissions & tenant feature flags
    const authorizedItems = items.filter((item) => {
      // Permission check
      if (item.requiredPermissions && item.requiredPermissions.length > 0) {
        const hasAllPermissions = item.requiredPermissions.every((perm) => hasPermission(perm));
        if (!hasAllPermissions) return false;
      }

      // Multi-tenant feature flag check
      if (item.requiredTenantFeatures && item.requiredTenantFeatures.length > 0) {
        const hasAllFeatures = item.requiredTenantFeatures.every((feat) => hasTenantFeature(feat));
        if (!hasAllFeatures) return false;
      }

      return true;
    });

    // 2. Sort authorized items by order weight
    const sortedItems = [...authorizedItems].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));

    // 3. Group into sections
    const sectionMap = new Map<string, NavigationItem[]>();

    sortedItems.forEach((item) => {
      const sectionKey = item.section || 'core';
      if (!sectionMap.has(sectionKey)) {
        sectionMap.set(sectionKey, []);
      }
      sectionMap.get(sectionKey)!.push(item);
    });

    // 4. Construct NavigationSection array
    const sections: NavigationSection[] = [];
    const sectionOrderMap: Record<string, number> = {
      overview: 10,
      core: 20,
      admin: 80,
      system: 90,
    };

    sectionMap.forEach((sectionItems, sectionId) => {
      sections.push({
        id: sectionId,
        title: sectionTitles[sectionId] || sectionId.toUpperCase(),
        order: sectionOrderMap[sectionId] ?? 50,
        items: sectionItems,
      });
    });

    return sections.sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  }
}
