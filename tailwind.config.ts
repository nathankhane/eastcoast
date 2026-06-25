import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      colors: {
        // Warm neutral surfaces + text (Saigon-inspired heritage palette).
        paper: "#f8f7f2",
        surface: { DEFAULT: "#ffffff", warm: "#fffdf7" },
        ink: { DEFAULT: "#29251f", soft: "#5b554c" },
        warm: "#e6dccb",
        cream: "#f6ead2",
        tan: { DEFAULT: "#a98258", ink: "#8a6a47" },
        // Fit-score status scale (red retuned to lacquer for cohesion).
        fit: { green: "#16a34a", yellow: "#d99a16", red: "#bd3342" },
        // Lacquer red — primary actions, active states, score highlights, wordmark.
        red: {
          50: "#fbeaec",
          100: "#f6cdd1",
          200: "#efa3ab",
          300: "#e57683",
          400: "#d44e5d",
          500: "#bd3342",
          600: "#a82c3a",
          700: "#8f2531",
          800: "#74202a",
          900: "#5a1a21",
        },
        // Weathered blue — secondary accents, outlines, selected states, links.
        blue: {
          50: "#eef4f8",
          100: "#d3e2ec",
          200: "#a9c5d7",
          300: "#7ba7c2",
          400: "#5f93b4",
          500: "#3f78a0",
          600: "#2f5f7f",
          700: "#27506b",
          800: "#1f4258",
          900: "#173042",
        },
        // Back-compat alias so any lingering brand-* utilities map to weathered blue.
        brand: {
          50: "#eef4f8",
          100: "#d3e2ec",
          200: "#a9c5d7",
          300: "#7ba7c2",
          400: "#5f93b4",
          500: "#3f78a0",
          600: "#2f5f7f",
          700: "#27506b",
          800: "#1f4258",
          900: "#173042",
        },
      },
    },
  },
  plugins: [],
};
export default config;
