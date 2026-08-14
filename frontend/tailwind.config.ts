import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './features/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
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
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        rail: {
          blue: '#0284c7',
          cyan: '#06b6d4',
          emerald: '#10b981',
          amber: '#f59e0b',
          rose: '#f43f5e',
          dark: '#0f172a',
          slate: '#1e293b',
          glass: 'rgba(255, 255, 255, 0.75)',
          'glass-dark': 'rgba(15, 23, 42, 0.75)',
          primary: 'hsl(var(--rail-primary))',
          secondary: 'hsl(var(--rail-secondary))',
          success: 'hsl(var(--rail-success))',
          warning: 'hsl(var(--rail-warning))',
          danger: 'hsl(var(--rail-danger))',
          surface: 'hsl(var(--rail-surface))',
          'surface-muted': 'hsl(var(--rail-surface-muted))',
          border: 'hsl(var(--rail-border))',
          muted: 'hsl(var(--rail-muted))',
          text: 'hsl(var(--rail-text))',
          ring: 'hsl(var(--rail-ring))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: '1rem',
        '2xl': '1.25rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      fontFamily: {
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '1', filter: 'drop-shadow(0 0 8px rgba(2, 132, 199, 0.6))' },
          '50%': { opacity: '0.6', filter: 'drop-shadow(0 0 2px rgba(2, 132, 199, 0.2))' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(12px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        sheetUp: {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
        dashMove: {
          '0%': { backgroundPosition: '0 0' },
          '100%': { backgroundPosition: '28px 0' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.8s infinite',
        'pulse-glow': 'pulseGlow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-up': 'fadeUp 0.3s ease-out both',
        'scale-in': 'scaleIn 0.2s ease-out both',
        'slide-in-right': 'slideInRight 0.25s ease-out both',
        'sheet-up': 'sheetUp 0.28s cubic-bezier(0.32, 0.72, 0, 1) both',
        'pulse-soft': 'pulseSoft 1.8s ease-in-out infinite',
        'dash-move': 'dashMove 0.6s linear infinite',
      },
      boxShadow: {
        glass: '0 8px 32px 0 rgba(31, 38, 135, 0.07)',
        'glass-hover': '0 12px 40px 0 rgba(31, 38, 135, 0.12)',
        glow: '0 0 20px -5px rgba(2, 132, 199, 0.4)',
        soft: 'var(--rail-shadow-soft)',
        lift: 'var(--rail-shadow-lift)',
      },
      backgroundImage: {
        'rail-gradient': 'linear-gradient(135deg, hsl(var(--rail-primary)) 0%, hsl(var(--rail-secondary)) 100%)',
        'rail-track': 'repeating-linear-gradient(90deg, hsl(var(--rail-border)) 0 8px, transparent 8px 16px)',
      },
    },
  },
  plugins: [],
};

export default config;
