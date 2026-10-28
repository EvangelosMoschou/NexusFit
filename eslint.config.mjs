import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    rules: {
      // eslint-config-next already registers the jsx-a11y plugin, so only the
      // rule set is applied here to avoid redefining it.
      ...jsxA11y.flatConfigs.recommended.rules,
      "no-console": ["warn", { allow: ["error", "warn"] }],
      // React Compiler-era rules. The existing hooks predate them and are
      // flagged for patterns that are safe here, so keep them visible without
      // failing lint.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "jsx-a11y/label-has-associated-control": "warn",
      "jsx-a11y/click-events-have-key-events": "warn",
      "jsx-a11y/no-static-element-interactions": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "site/**",
  ]),
]);

export default eslintConfig;
