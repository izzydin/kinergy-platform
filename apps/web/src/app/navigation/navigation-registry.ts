import { defaultNavigationItems } from './navigation.config';
import type { NavigationItem } from './navigation.types';

/**
 * Configuration-Driven Navigation Registry
 *
 * Centralized registry allowing future feature modules (`src/modules/*`) to register
 * navigation entries dynamically through their public API without hardcoding items in UI components.
 */
import { logger } from '../../shared/logger/platform-logger';

class NavigationRegistry {
  private readonly items = new Map<string, NavigationItem>();
  private readonly listeners = new Set<() => void>();
  private readonly log = logger.withContext('NavigationRegistry');

  constructor() {
    // Pre-populate with baseline configuration items
    this.registerMany(defaultNavigationItems);
  }

  /**
   * Subscribe to registry mutations (additions, removals, updates)
   */
  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        this.log.error('Error in subscriber listener', err);
      }
    });
  }

  /**
   * Registers a single navigation entry.
   */
  public register(item: NavigationItem): void {
    if (this.items.has(item.id)) {
      this.log.warn(
        'Duplicate navigation item ID warning. Overwriting existing navigation definition.',
        {
          itemId: item.id,
        },
      );
    }
    this.items.set(item.id, item);
    this.notify();
  }

  /**
   * Registers multiple navigation entries at once.
   */
  public registerMany(items: NavigationItem[]): void {
    items.forEach((item) => this.items.set(item.id, item));
    this.notify();
  }

  /**
   * Unregisters a navigation entry by ID.
   */
  public unregister(id: string): void {
    this.items.delete(id);
    this.notify();
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
    this.notify();
  }
}

export const navigationRegistry = new NavigationRegistry();
