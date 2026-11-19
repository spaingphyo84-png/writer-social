/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        myanmar: ['"Padauk"', '"Pyidaungsu"', 'Inter', 'sans-serif'],
        serif: ['"Lora"', 'Georgia', 'serif'],
      },
      colors: {
        parchment: {
          50: '#fdfbf7',
          100: '#faf6ed',
          200: '#f4ecdc',
          300: '#eadcbf',
          400: '#dcc49a',
        },
        ink: {
          50: '#f4f5f7',
          100: '#e7e9ee',
          700: '#333b4d',
          800: '#222938',
          900: '#161c29',
          950: '#0e131d',
        },
        terracotta: {
          400: '#e08a6a',
          500: '#cf6f4d',
          600: '#b85a3b',
        },
        gold: {
          400: '#d9ad5c',
          500: '#c6933e',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(60,45,25,.04), 0 8px 30px -12px rgba(60,45,25,.14)',
        'card-dark': '0 1px 2px rgba(0,0,0,.3), 0 12px 32px -16px rgba(0,0,0,.7)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'toast-in': {
          '0%': { opacity: '0', transform: 'translateY(12px) scale(.96)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .35s ease-out both',
        'toast-in': 'toast-in .25s ease-out both',
      },
    },
  },
  plugins: [],
}
