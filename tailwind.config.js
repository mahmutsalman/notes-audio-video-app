/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Custom color palette for the app
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
          950: '#082f49',
        },
        dark: {
          bg: '#0f0f0f',
          surface: '#1a1a1a',
          border: '#2a2a2a',
          hover: '#333333',
        }
      },
      animation: {
        'pulse-recording': 'pulse-recording 1.5s ease-in-out infinite',
        'waveform': 'waveform 0.5s ease-in-out infinite',
        'input-glow': 'input-glow 0.6s ease-out',
      },
      keyframes: {
        'pulse-recording': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.1)', opacity: '0.8' },
        },
        'waveform': {
          '0%, 100%': { height: '20%' },
          '50%': { height: '100%' },
        },
        // Accomplishment pulse when the user presses Enter in a review note field
        'input-glow': {
          '0%':   { boxShadow: '0 0 0 0 rgba(16,185,129,0)', borderColor: 'rgb(16,185,129)' },
          '25%':  { boxShadow: '0 0 0 3px rgba(16,185,129,0.45), 0 0 22px 4px rgba(16,185,129,0.55)', borderColor: 'rgb(16,185,129)' },
          '100%': { boxShadow: '0 0 0 0 rgba(16,185,129,0)', borderColor: 'rgb(16,185,129)' },
        },
      },
    },
  },
  plugins: [],
}
