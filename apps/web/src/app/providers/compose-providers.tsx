import React from 'react';

export type ProviderComponent = React.ComponentType<{ children: React.ReactNode }>;

/**
 * Functional Provider Composition Utility
 *
 * Composes an array of React Provider components from outer to inner (left to right).
 * Enforces "Composition over Inheritance" and prevents deep "Pyramid of Doom" JSX nesting.
 *
 * @param providers Array of Provider components ordered from outermost to innermost
 * @returns Composed root provider component
 */
export function composeProviders(
  providers: ProviderComponent[],
): React.FC<{ children: React.ReactNode }> {
  return ({ children }: { children: React.ReactNode }) =>
    providers.reduceRight(
      (acc, Provider) => <Provider>{acc}</Provider>,
      children as React.ReactElement,
    );
}
