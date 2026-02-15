import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        masters: {
          green: "#006747",
          fairway: "#0d8555",
          putting: "#1a9f6a",
        },
        cream: {
          DEFAULT: "#faf8f5",
          dark: "#f0ede8",
        },
        gold: {
          DEFAULT: "#c9a227",
          light: "#dbb94a",
        },
        bronze: "#8b6914",
        charcoal: {
          DEFAULT: "#1a1a1a",
          light: "#2d2d2d",
        },
        sand: "#e8dcc8",
        rough: "#4a5d3a",
      },
      fontFamily: {
        display: ["'Cormorant Garamond'", "Georgia", "serif"],
        body: ["'Outfit'", "system-ui", "sans-serif"],
      },
      boxShadow: {
        'golf-sm': '0 1px 2px rgba(0, 0, 0, 0.04), 0 1px 3px rgba(0, 103, 71, 0.04)',
        'golf-md': '0 4px 6px rgba(0, 0, 0, 0.04), 0 2px 4px rgba(0, 103, 71, 0.06)',
        'golf-lg': '0 10px 15px rgba(0, 0, 0, 0.05), 0 4px 6px rgba(0, 103, 71, 0.08)',
        'golf-xl': '0 20px 25px rgba(0, 0, 0, 0.06), 0 10px 10px rgba(0, 103, 71, 0.04)',
        'gold': '0 4px 12px rgba(201, 162, 39, 0.3)',
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'stagger': 'staggerIn 0.4s ease-out backwards',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        staggerIn: {
          from: { opacity: '0', transform: 'translateX(-10px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
};
export default config;
