/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig, globalIgnores } from "eslint/config";
import base, { browser, node, typeChecked } from "@allurx/js-config/eslint";

export default defineConfig(
    globalIgnores(["**/dist/", ".wrangler/", "work/"]),
    base,

    // Every workspace participates in the same typed rules with its own environment.
    {
        files: ["**/*.ts"],
        extends: [typeChecked],
        languageOptions: {
            parserOptions: { tsconfigRootDir: import.meta.dirname },
        },
    },

    {
        files: ["projects/*/src/**/*.ts"],
        extends: [browser],
    },
    {
        files: ["projects/tiny-bay/src/engine.ts"],
        // The numeric kernel indexes fixed-size buffers inside bounded loops; keep those assertions explicit.
        rules: { "@typescript-eslint/no-non-null-assertion": "off" },
    },
    { files: ["*.ts", "scripts/**/*.ts", "build/**/*.ts", "projects/*/vite.config.ts"], extends: [node] }
);
