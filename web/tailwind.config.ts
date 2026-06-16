import type { Config } from 'tailwindcss';

/**
 * As cores NÃO são fixas: apontam para CSS custom properties que o layout
 * injeta por tenant (var(--color-primary) etc.). Assim, o mesmo build serve
 * todas as prefeituras, cada uma com sua identidade visual.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        'primary-fg': 'var(--color-primary-fg)',
        secondary: 'var(--color-secondary)',
        'secondary-fg': 'var(--color-secondary-fg)',
        accent: 'var(--color-accent)',
        bg: 'var(--color-bg)',
        fg: 'var(--color-fg)',
        muted: 'var(--color-muted)',
        border: 'var(--color-border)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        danger: 'var(--color-danger)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        heading: 'var(--font-heading)',
      },
      borderRadius: {
        DEFAULT: 'var(--radius-base)',
      },
    },
  },
  plugins: [],
};
export default config;
