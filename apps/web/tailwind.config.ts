import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular"]
      },
      colors: {
        bg: "var(--color-bg)",
        panel: "var(--color-panel)",
        text: "var(--color-text)",
        muted: "var(--color-muted)",
        accent: "var(--color-accent)",
        accent2: "var(--color-accent-2)",
        border: "var(--color-border)",
        ring: "var(--color-ring)"
      },
      boxShadow: {
        glow: "0 0 30px rgba(7, 212, 186, 0.2)",
        card: "0 20px 40px rgba(10, 10, 20, 0.08)"
      },
      borderRadius: {
        xl: "18px"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};

export default config;
