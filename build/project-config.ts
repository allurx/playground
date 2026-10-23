/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { readFileSync } from "node:fs";
import { defineConfig, mergeConfig, type Plugin } from "vite";
import base from "@allurx/js-config/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

interface Notice {
    name: string;
    path: URL;
}

interface ProjectOptions {
    name: string;
    notices?: readonly Notice[];
}

/**
 * Share delivery rules while each work owns its entry, renderer and runtime dependencies.
 */
export function projectConfig({ name, notices = [] }: ProjectOptions) {
    return defineConfig(({ mode }) => {
        const portable = mode === "portable";
        return mergeConfig(base, {
            base: "./",
            build: {
                outDir: portable ? "dist/portable" : "dist/web",
                emptyOutDir: true,
                ...(portable
                    ? {
                          assetsInlineLimit: () => true,
                          assetsDir: "",
                          cssCodeSplit: false,
                          rolldownOptions: { output: { codeSplitting: false } },
                      }
                    : {}),
            },
            // Keep single-file requirements explicit without the plugin's warning-threshold override.
            plugins: [
                portable && viteSingleFile({ useRecommendedBuildConfig: false }),
                deliveryPlugin(name, portable, notices),
            ],
        });
    });
}

/**
 * Carry the repository license and actual runtime notices into both delivery formats.
 */
function deliveryPlugin(name: string, portable: boolean, notices: readonly Notice[]): Plugin {
    const license = readFileSync(new URL("../LICENSE.txt", import.meta.url), "utf8");
    const thirdParty = notices.map((notice) => `${notice.name}\n\n${readFileSync(notice.path, "utf8")}`).join("\n\n");

    return {
        name: "playground:delivery",
        apply: "build",
        enforce: "post",
        transformIndexHtml: {
            order: "pre",
            handler(html) {
                if (!portable) return html;
                const favicon = readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8");
                return html.replaceAll(
                    'href="../favicon.svg"',
                    `href="data:image/svg+xml,${encodeURIComponent(favicon)}"`
                );
            },
        },
        generateBundle: {
            order: "post",
            handler(_options, bundle) {
                if (!portable) {
                    this.emitFile({ type: "asset", fileName: "LICENSE.txt", source: license });
                    if (thirdParty) {
                        this.emitFile({ type: "asset", fileName: "THIRD-PARTY-NOTICES.txt", source: thirdParty });
                    }
                    return;
                }

                const entry = bundle["index.html"];
                if (entry?.type !== "asset" || typeof entry.source !== "string") {
                    throw new Error(`${name}: portable HTML was not generated`);
                }
                if (!/<html\b/i.test(entry.source)) {
                    throw new Error(`${name}: portable HTML must contain an <html> root element`);
                }
                const header = `<!--\nCopyright 2026 allurx\nSPDX-License-Identifier: Apache-2.0\n\n${license.trim()}${thirdParty ? `\n\n${thirdParty.trim()}` : ""}\n-->`;
                const html = entry.source.replace(/<html\b/i, (tag) => `${header}\n${tag}`);
                this.emitFile({ type: "asset", fileName: `${name}.html`, source: html });
                delete bundle["index.html"];
            },
        },
    };
}
