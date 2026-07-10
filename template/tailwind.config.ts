import type { Config } from 'tailwindcss';

// Design tokens live as CSS variables in app/globals.css; this just wires
// Tailwind utility names (bg-panel, text-muted, ...) to those variables.
// SPEC v1.3 §0.2: sharp 2px radius, 1px borders, monochrome — no purple/indigo/violet,
// no gradients, no soft shadows.
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'var(--bg)',
        foreground: 'var(--text)',
        muted: 'var(--muted)',
        border: 'var(--border)',
        surface: 'var(--panel)',
        panel2: 'var(--panel-2)',
        ok: 'var(--ok)',
        danger: 'var(--danger)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
      },
      fontFamily: {
        sans: ['var(--font-sans)'],
      },
    },
  },
  plugins: [],
};

export default config;
