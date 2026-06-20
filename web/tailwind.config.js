/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        darkBackground: '#000000',
        cardSurface: '#0B0B0C',
        borderSubtle: '#1D1D1F',
        primaryAccent: '#7C3AED',
        primaryHover: '#6D28D9',
        mutedText: '#94A3B8',
        usdcColor: '#2775CA',
        eurcColor: '#1A365D',
      },
    },
  },
  plugins: [],
};
