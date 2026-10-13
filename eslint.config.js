import { defineConfig, globalIgnores } from "eslint/config";
import base, { browser, node } from "@allurx/web-foundation/eslint";

export default defineConfig(
    globalIgnores(["**/dist/", ".wrangler/", "work/"]),
    base,
    { files: ["projects/**/*.js", "src/**/*.js", "public/**/*.js"], extends: [browser] },
    { files: ["*.js", "scripts/**/*.mjs", "projects/*/scripts/**/*.mjs"], extends: [node] }
);
