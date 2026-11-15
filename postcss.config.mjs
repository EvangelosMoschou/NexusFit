// Tailwind 4 ships its PostCSS integration as a separate package
// (`@tailwindcss/postcss`); the old `tailwindcss` plugin entry no longer exists.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
