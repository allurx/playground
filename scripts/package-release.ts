/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const [tag, ...extra] = process.argv.slice(2);
if (!tag || extra.length > 0 || !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag)) {
    throw new Error("Usage: node scripts/package-release.ts vMAJOR.MINOR.PATCH");
}

const root = new URL("../", import.meta.url);
const portable = new URL("dist/portable/", root);
const output = new URL("dist/release/", root);
const entries = await readdir(portable, { withFileTypes: true });
const names = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"))
    .map((entry) => entry.name)
    .sort();
if (names.length === 0) throw new Error("No portable HTML files were generated in dist/portable/");

// Read the complete input set before replacing generated release assets.
const assets = await Promise.all(
    names.map(async (name) => {
        if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.html$/.test(name)) {
            throw new Error(`Portable HTML filename must use a lowercase project slug: ${name}`);
        }
        const contents = await readFile(new URL(name, portable));
        if (contents.length === 0) throw new Error(`Portable HTML file is empty: ${name}`);
        return { name: `${name.slice(0, -5)}-${tag}.html`, contents };
    })
);

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const asset of assets) await writeFile(new URL(asset.name, output), asset.contents);

// GNU sha256sum can verify this manifest directly in the publish job.
const checksums = assets
    .map(({ name, contents }) => `${createHash("sha256").update(contents).digest("hex")}  ${name}\n`)
    .join("");
await writeFile(new URL("SHA256SUMS.txt", output), checksums);
console.log(`Packaged ${assets.length} portable works for ${tag} into ${fileURLToPath(output)}`);
