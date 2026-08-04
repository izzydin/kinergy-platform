import React from 'react';

/**
 * Module Route Registration Contract
 *
 * Defines the public route specification exported by feature modules (src/modules/<domain>/).
 */
export interface ModuleRouteDefinition {
  /** Unique module identifier (e.g., 'auth', 'client', 'energy', 'analytics') */
  readonly id: string;
  /** Primary URL path prefix (e.g., '/auth', '/clients', '/energy', '/analytics') */
  readonly prefix: string;
  /** Human-readable module title for navigation headers */
  readonly title: string;
  /** Whether routes beneath this prefix require authentication */
  readonly isProtected: boolean;
  /** Required permissions for accessing the module root */
  readonly requiredPermissions?: string[];
  /** React component rendering the module's sub-router tree */
  readonly component: React.ComponentType;
}

class ModuleRouteRegistry {
  private readonly modules = new Map<string, ModuleRouteDefinition>();

  /**
   * Registers a feature module's routing contract with the central router shell.
   */
  public register(definition: ModuleRouteDefinition): void {
    if (this.modules.has(definition.id)) {
      console.warn(
        `[ModuleRouteRegistry] Duplicate module registration warning: ${definition.id}. Overwriting existing route definition.`,
      );
    }
    this.modules.set(definition.id, definition);
  }

  /**
   * Returns all registered module route definitions.
   */
  public getRegisteredModules(): ModuleRouteDefinition[] {
    return Array.from(this.modules.values());
  }

  /**
   * Returns registered public module definitions.
   */
  public getPublicModules(): ModuleRouteDefinition[] {
    return this.getRegisteredModules().filter((m) => !m.isProtected);
  }

  /**
   * Returns registered protected module definitions.
   */
  public getProtectedModules(): ModuleRouteDefinition[] {
    return this.getRegisteredModules().filter((m) => m.isProtected);
  }

  /**
   * Clears all registered modules (useful for testing).
   */
  public clear(): void {
    this.modules.clear();
  }
}

export const moduleRegistry = new ModuleRouteRegistry();
