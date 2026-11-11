/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './apps/web/index.html',
    './apps/web/src/**/*.{js,ts,jsx,tsx}',
    './packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        // shadcn/ui semantic mappings bound to CSS Custom Properties
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },

        // Official Kinergy Brand Tokens (KIN-BRAND-UI-001)
        brand: {
          DEFAULT: 'var(--kinergy-forest)',
          green: 'var(--kinergy-green)',
          forest: 'var(--kinergy-forest)',
          charcoal: 'var(--kinergy-charcoal)',
          soft: 'var(--kinergy-soft)',
          tint: 'var(--kinergy-tint)',
          foreground: 'hsl(var(--brand-foreground, var(--foreground)))',
        },

        // Semantic Status Feedback Tokens
        status: {
          success: {
            DEFAULT: 'var(--status-success)',
            foreground: 'var(--status-success-foreground)',
            surface: 'var(--status-success-surface)',
            border: 'var(--status-success-border)',
          },
          warning: {
            DEFAULT: 'var(--status-warning)',
            foreground: 'var(--status-warning-foreground)',
            surface: 'var(--status-warning-surface)',
            border: 'var(--status-warning-border)',
          },
          danger: {
            DEFAULT: 'var(--status-danger)',
            foreground: 'var(--status-danger-foreground)',
            surface: 'var(--status-danger-surface)',
            border: 'var(--status-danger-border)',
          },
          info: {
            DEFAULT: 'var(--status-info)',
            foreground: 'var(--status-info-foreground)',
            surface: 'var(--status-info-surface)',
            border: 'var(--status-info-border)',
          },
        },

        // Data Visualization & Chart Tokens
        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          4: 'var(--chart-4)',
          5: 'var(--chart-5)',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: 0 },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 0 },
        },
        'pulse-subtle': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.5 },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'pulse-subtle': 'pulse-subtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
