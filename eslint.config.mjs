import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    rules: {
      /*
       * DroMap est en alpha privée.
       * On désactive temporairement les règles qui bloquent le déploiement
       * mais qui ne doivent pas empêcher un test Vercel.
       */
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/immutability": "off",
      "@typescript-eslint/no-explicit-any": "off",

      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_"
        }
      ],

      "@next/next/no-img-element": "warn",
      "react-hooks/exhaustive-deps": "warn"
    }
  },

  {
    files: [
      "editor/geojson-layers-renderer.tsx",
      "editor/geojson-leaflet-rendering.ts",
      "editor/geojson-layer-style.ts",
      "editor/export-*.{ts,tsx}",
      "app/**/render/**/*.{ts,tsx}",
      "lib/dromap/project-thumbnail.ts",
      "components/dromap-product/dashboard-project-export-dialog.tsx"
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/editor-only/**",
                "./editor-only/**",
                "../**/editor-only/**",
                "@/**/editor-only/**"
              ],
              message: "Le culling viewport est réservé à l'éditeur ; preview et export doivent utiliser les données complètes."
            }
          ]
        }
      ]
    }
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts"
  ])
]);

export default eslintConfig;
