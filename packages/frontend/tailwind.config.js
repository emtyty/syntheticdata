/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── Legacy shadcn CSS-variable tokens (used by internal components) ──
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        // ── Neon Architect palette (used by new layout pages) ──────────────
        'studio-blue': '#2E5BFF',
        'surface-container': '#151a21',
        'surface-container-high': '#1b2028',
        'surface-container-highest': '#20262f',
        'surface-container-low': '#0f141a',
        'surface-container-lowest': '#000000',
        'surface-bright': '#262c36',
        'surface-variant': '#20262f',
        'on-surface': '#f1f3fc',
        'on-surface-variant': '#a8abb3',
        'on-primary-fixed': '#000000',
        'outline-variant': '#44484f',
        tertiary: '#99f7ff',
        'tertiary-dim': '#00e2ee',
        'primary-fixed-dim': '#5391ff',
        error: '#ff6e84',
        'error-container': '#a70138',
      },
      fontFamily: {
        headline: ['Space Grotesk', 'sans-serif'],
        body: ['Inter', 'sans-serif'],
        label: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
}
