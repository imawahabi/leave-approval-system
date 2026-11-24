/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      borderRadius: {
        sm: '0.625rem',
        DEFAULT: '0.875rem',
        md: '0.875rem',
        lg: '1rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '1.75rem',
      },
      fontFamily: {
        sans: ['Cairo', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Teal is the legacy brand token used across existing screens; keep it
        // aligned with the new navy identity while green stays semantic via emerald.
        teal: {
          50: '#f1f5f9', 100: '#e1e8f0', 200: '#c6d2e0', 300: '#a2b5ca',
          400: '#7892b0', 500: '#557397', 600: '#3b5a7e', 700: '#243e64',
          800: '#1b3152', 900: '#142744', 950: '#0b172b',
        },
        primary: {
          50: '#f1f5f9', 100: '#e1e8f0', 200: '#c6d2e0', 300: '#a2b5ca',
          400: '#7892b0', 500: '#557397', 600: '#3b5a7e', 700: '#243e64',
          800: '#1b3152', 900: '#142744', 950: '#0b172b',
        },
        accent: {
          50: '#fff9e8', 100: '#fff0bf', 200: '#ffe08a', 300: '#ffd15b',
          400: '#f7bd39', 500: '#e8a91f', 600: '#c88912', 700: '#9e680f',
          800: '#805316', 900: '#694518',
        },
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px 0 rgb(0 0 0 / 0.04)',
        'card-hover': '0 4px 12px 0 rgb(0 0 0 / 0.08), 0 2px 4px 0 rgb(0 0 0 / 0.04)',
      },
    },
  },
  plugins: [],
};
