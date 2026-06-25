import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        fit: { green: "#16a34a", yellow: "#eab308", red: "#dc2626" },
        // Baby-blue brand accent.
        brand: {
          50: "#f0f7ff",
          100: "#e0effe",
          200: "#bbdcfc",
          300: "#8fc6f7",
          400: "#5fabef",
          500: "#3a90e2",
          600: "#2f7fd0",
          700: "#2766a8",
          800: "#234f80",
          900: "#1f3f63",
        },
      },
    },
  },
  plugins: [],
};
export default config;
