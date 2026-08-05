import {
  cn,
  cva,
  DARK_SEMANTIC_COLORS,
  DESIGN_TOKENS,
  DISABLED_CLASSES,
  FOCUS_RING_CLASSES,
  LIGHT_SEMANTIC_COLORS,
  Slot,
} from '../index';

describe('Design System Foundation (@kinergy-platform/ui)', () => {
  describe('Style Composition Utility (cn)', () => {
    it('merges class names and resolves Tailwind utility conflicts correctly', () => {
      const result = cn('px-2 py-1 bg-red-500', 'px-4 bg-blue-500', { 'text-white': true });
      expect(result).toContain('px-4');
      expect(result).toContain('bg-blue-500');
      expect(result).toContain('text-white');
      expect(result).not.toContain('px-2');
      expect(result).not.toContain('bg-red-500');
    });

    it('handles falsy and undefined values gracefully', () => {
      const isHidden: boolean = Boolean(process.env['NON_EXISTENT_VAR']);
      const result = cn('base-class', isHidden && 'hidden', undefined, null, 'active-class');
      expect(result).toBe('base-class active-class');
    });
  });

  describe('Design Tokens Engine', () => {
    it('exports complete Light and Dark semantic HSL color maps', () => {
      expect(LIGHT_SEMANTIC_COLORS.primary).toBeDefined();
      expect(LIGHT_SEMANTIC_COLORS.background).toBeDefined();
      expect(DARK_SEMANTIC_COLORS.primary).toBeDefined();
      expect(DARK_SEMANTIC_COLORS.background).toBeDefined();
    });

    it('defines complete platform DESIGN_TOKENS object structure', () => {
      expect(DESIGN_TOKENS.typography.fontFamily.sans).toContain('Inter');
      expect(DESIGN_TOKENS.spacing.md).toBe('1rem');
      expect(DESIGN_TOKENS.radius.lg).toBe('var(--radius)');
      expect(DESIGN_TOKENS.zIndex.modal).toBe(50);
    });
  });

  describe('Variant Helper Engine (CVA)', () => {
    it('generates variant class functions using cva', () => {
      const buttonVariants = cva('base-button', {
        variants: {
          variant: {
            default: 'bg-primary text-primary-foreground',
            destructive: 'bg-destructive text-destructive-foreground',
          },
          size: {
            sm: 'h-8 px-3 text-xs',
            md: 'h-10 px-4 text-sm',
          },
        },
        defaultVariants: {
          variant: 'default',
          size: 'md',
        },
      });

      expect(buttonVariants()).toContain('base-button');
      expect(buttonVariants()).toContain('bg-primary');
      expect(buttonVariants()).toContain('h-10');

      expect(buttonVariants({ variant: 'destructive', size: 'sm' })).toContain('bg-destructive');
      expect(buttonVariants({ variant: 'destructive', size: 'sm' })).toContain('h-8');
    });
  });

  describe('Accessibility & Composition Tokens', () => {
    it('exports accessible focus ring and disabled utility token classes', () => {
      expect(FOCUS_RING_CLASSES).toContain('focus-visible:ring-2');
      expect(DISABLED_CLASSES).toContain('disabled:opacity-50');
    });

    it('exports Radix UI Slot primitive for polymorphic asChild composition', () => {
      expect(Slot).toBeDefined();
    });
  });
});
