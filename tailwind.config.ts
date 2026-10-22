import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // Friendly, Soft Slate & Graphite Theme (Pleasant Light-Dark)
        background: "#181A20", // Warm soft charcoal, not pitch black
        surface: "#21242D",
        "surface-card": "#282C37",
        "surface-elevated": "#313643",
        border: "#3B4151",
        "border-light": "#4A5266",
        
        // Friendly, Warm Athletic Accent (Warm Amber-Orange / Soft Coral)
        accent: {
          DEFAULT: "#38BDF8", // Soft friendly sky cyan / or clean athletic teal
          hover: "#0284C7",
          warm: "#F59E0B",
          emerald: "#10B981",
        },
        primary: "#F3F4F6",
        secondary: "#A5ADC1",
        tertiary: "#7E879C",
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
