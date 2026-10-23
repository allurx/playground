/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { defineConfig, mergeConfig } from "vite";
import { projectConfig } from "../../build/project-config.ts";

const deliveryConfig = projectConfig({
    name: "sky-island",
    notices: [{ name: "Three.js (MIT)", path: new URL("../../node_modules/three/LICENSE", import.meta.url) }],
});

export default defineConfig((environment) => {
    const config = deliveryConfig(environment);
    if (environment.mode === "portable") return config;

    return mergeConfig(config, {
        build: {
            rolldownOptions: {
                output: {
                    codeSplitting: {
                        groups: [
                            // Capture Three's standalone core first; the renderer and addons then depend on it.
                            { name: "three-core", test: /node_modules[\\/]three[\\/]build[\\/]three\.core\.js$/ },
                            { name: "three-runtime", test: /node_modules[\\/]three[\\/]/ },
                        ],
                    },
                },
            },
        },
    });
});
