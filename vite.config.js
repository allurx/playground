// Copyright (c) 2026 allurx

import { mergeConfig } from "vite";
import base from "@allurx/web-foundation/vite";

export default mergeConfig(base, {
    preview: {
        host: "0.0.0.0",
        port: 4173,
        strictPort: true,
        open: true,
    },
});
