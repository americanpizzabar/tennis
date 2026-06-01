/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        court: {
          bg: '#0A1A0A',
          surface: '#0D1F0D',
          card: '#1A2E1A',
          accent: '#4CAF50',
          danger: '#EF5350',
          warning: '#F9A825',
          info: '#42A5F5',
        },
      },
    },
  },
  plugins: [],
}
