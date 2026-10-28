import type { Config } from "tailwindcss";

// Themeable palette.
//
// Every colour resolves to an RGB triplet held in a CSS variable, so the whole
// site can be recoloured by switching `data-theme` on <html> without touching
// a single component. The `/<alpha-value>` form keeps opacity modifiers such as
// `bg-surface/50` working.
const config: Config = {
  content: [
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--bg-rgb) / <alpha-value>)",
        surface: "rgb(var(--surface-rgb) / <alpha-value>)",
        "surface-card": "rgb(var(--surface-card-rgb) / <alpha-value>)",
        "surface-elevated": "rgb(var(--surface-elevated-rgb) / <alpha-value>)",
        border: "rgb(var(--border-rgb) / <alpha-value>)",
        "border-light": "rgb(var(--border-light-rgb) / <alpha-value>)",

        foreground: "rgb(var(--ink-rgb) / <alpha-value>)",
        primary: "rgb(var(--ink-rgb) / <alpha-value>)",
        secondary: "rgb(var(--muted-rgb) / <alpha-value>)",
        tertiary: "rgb(var(--faint-rgb) / <alpha-value>)",

        accent: {
          DEFAULT: "rgb(var(--accent-rgb) / <alpha-value>)",
          hover: "rgb(var(--accent-hover-rgb) / <alpha-value>)",
          ink: "rgb(var(--accent-ink-rgb) / <alpha-value>)",
          warm: "#F59E0B",
          emerald: "#10B981",
        },

        btn: "rgb(var(--btn-rgb) / <alpha-value>)",
        "btn-hover": "rgb(var(--btn-hover-rgb) / <alpha-value>)",
        "btn-ink": "rgb(var(--btn-ink-rgb) / <alpha-value>)",
      },
      borderRadius: {
        DEFAULT: "8px",
        md: "10px",
        lg: "12px",
        xl: "16px",
        "2xl": "20px",
      },
    },
  },
  plugins: [],
};

export default config;
