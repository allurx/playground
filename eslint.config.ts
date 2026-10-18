import { defineConfig, globalIgnores } from "eslint/config";
import base, { browser, node, typeChecked } from "@allurx/js-config/eslint";

export default defineConfig(
    globalIgnores(["**/dist/", ".wrangler/", "work/"]),
    base,

    // Tool configuration is type-checked; each work keeps its own source checks.
    {
        files: ["*.ts"],
        extends: [typeChecked, node],
        languageOptions: {
            parserOptions: { tsconfigRootDir: import.meta.dirname },
        },
    },

    { files: ["projects/**/*.js", "src/**/*.js", "public/**/*.js"], extends: [browser] },
    { files: ["scripts/**/*.mjs", "projects/*/scripts/**/*.mjs"], extends: [node] }
);
