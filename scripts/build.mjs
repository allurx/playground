/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { cp, glob, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const output = new URL("dist/", root);
const { homepage } = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
const siteUrl = new URL(homepage);
const pageUrls = [siteUrl.href];

// Keep the output directory itself so preview watchers remain attached on Windows.
await mkdir(output, { recursive: true });
for (const entry of await readdir(output)) {
    await rm(join(fileURLToPath(output), entry), { recursive: true, force: true });
}
await cp(new URL("public/", root), output, { recursive: true });
await cp(new URL("index.html", root), new URL("index.html", output));
await cp(new URL("LICENSE.txt", root), new URL("LICENSE.txt", output));
await mkdir(new URL("src/", output), { recursive: true });
await cp(new URL("src/styles.css", root), new URL("src/styles.css", output));

// Each project owns its build; the collection only publishes its resulting assets.
for await (const manifest of glob("projects/*/package.json", { cwd: fileURLToPath(root) })) {
    const name = basename(dirname(manifest));
    const projectOutput = new URL(`projects/${name}/dist/`, root);
    await cp(projectOutput, new URL(`${name}/`, output), { recursive: true });

    // Index published project entries, keeping downloadable copies out of search results.
    const files = await readdir(projectOutput, { withFileTypes: true });
    if (files.some((file) => file.isFile() && file.name === "index.html")) {
        pageUrls.push(new URL(`${encodeURIComponent(name)}/`, siteUrl).href);
    }
}

// The package homepage and published entries are the only sources for crawler URLs.
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pageUrls.map((url) => `    <url><loc>${url.replaceAll("&", "&amp;")}</loc></url>`).join("\n")}
</urlset>
`;
await writeFile(new URL("sitemap.xml", output), sitemap);
await writeFile(
    new URL("robots.txt", output),
    `User-agent: *
Allow: /

Sitemap: ${new URL("sitemap.xml", siteUrl).href}
`
);

console.log(`Built Playground into ${fileURLToPath(output)}`);
