/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#E8F2FF',
          100: '#C7DFFF',
          500: '#1A6BB5',
          600: '#0F4C81',
          700: '#0A3660',
          800: '#062244',
        },
        accent: {
          50: '#E6F7F3',
          100: '#C0EAE0',
          500: '#00A878',
          600: '#008F66',
        },
      },
      fontFamily: {
        sans: ['DM Sans', 'system-ui', 'sans-serif'],
        display: ['Bricolage Grotesque', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
