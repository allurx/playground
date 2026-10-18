/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { mergeConfig } from "vite";
import base from "@allurx/js-config/vite";

export default mergeConfig(base, {
    preview: {
        host: "0.0.0.0",
        port: 4173,
        strictPort: true,
        open: true,
    },
});
