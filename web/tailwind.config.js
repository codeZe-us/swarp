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
        primaryAccent: '#5E2A8C',
        primaryHover: '#4A1F70',
        mutedText: '#94A3B8',
        usdcColor: '#2775CA',
        eurcColor: '#1A365D',
        brandPurple: '#5E2A8C',
        brandDarkPurple: '#4A1F70',
        brandDarkerPurple: '#3E1A60',
        brandDarkestPurple: '#341552',
        brandLightPurple: '#B488DC',
        brandLighterPurple: '#D6C2EC',
      },
      fontFamily: {
        sans: ['var(--font-hanken-grotesk)', 'sans-serif'],
        display: ['var(--font-space-grotesk)', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'monospace'],
      },
      keyframes: {
        gradient: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        gradient: 'gradient 3s ease infinite',
        shimmer: 'shimmer 1.5s infinite',
      },
    },
  },
  plugins: [],
};
