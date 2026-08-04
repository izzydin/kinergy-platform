import type { NavigationItem } from './navigation.types';

/**
 * Configuration-Driven Navigation Registry
 *
 * Centralized registry allowing future feature modules (`src/modules/*`) to register
 * navigation entries dynamically through their public API without hardcoding items in UI components.
 */
class NavigationRegistry {
  private readonly items = new Map<string, NavigationItem>();

  /**
   * Registers a single navigation entry.
   */
  public register(item: NavigationItem): void {
    if (this.items.has(item.id)) {
      console.warn(
        `[NavigationRegistry] Duplicate navigation item ID warning: '${item.id}'. Overwriting existing navigation definition.`,
      );
    }
    this.items.set(item.id, item);
  }

  /**
   * Registers multiple navigation entries at once.
   */
  public registerMany(items: NavigationItem[]): void {
    items.forEach((item) => this.register(item));
  }

  /**
   * Unregisters a navigation entry by ID.
   */
  public unregister(id: string): void {
    this.items.delete(id);
  }

  /**
   * Returns all registered navigation items as an array.
   */
  public getItems(): NavigationItem[] {
    return Array.from(this.items.values());
  }

  /**
   * Resets registry state (useful for test isolation).
   */
  public clear(): void {
    this.items.clear();
  }
}

export const navigationRegistry = new NavigationRegistry();
