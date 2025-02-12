// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      minHeight: {
        'calendar-cell': '6rem'
      },
      backgroundColor: {
        'calendar-hover': 'rgba(229, 231, 235, 0.5)'
      }
    },
  },
  plugins: []
}