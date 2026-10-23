/*
 * Copyright 2026 allurx
 * SPDX-License-Identifier: Apache-2.0
 */

import { cp, glob, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const [mode, ...extra] = process.argv.slice(2);
if ((mode !== "web" && mode !== "portable") || extra.length > 0) {
    throw new Error("Usage: node scripts/build.ts web|portable");
}

const root = new URL("../", import.meta.url);
const output = new URL(`dist/${mode}/`, root);

const metadata: unknown = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
if (!metadata || typeof metadata !== "object" || !("homepage" in metadata) || typeof metadata.homepage !== "string") {
    throw new Error("package.json must declare the collection homepage");
}
const siteUrl = new URL(metadata.homepage);
const pageUrls = [siteUrl.href];
const projects: { name: string; output: URL }[] = [];

// Reject known input failures before replacing a working preview or portable build.
if (mode === "web") {
    for (const path of ["public/", "shared/icons/", "index.html", "src/styles.css", "LICENSE.txt"]) {
        const source = await stat(new URL(path, root));
        if (path.endsWith("/") ? !source.isDirectory() : !source.isFile()) {
            throw new Error(`Invalid collection build source: ${path}`);
        }
    }
}

for await (const manifest of glob("projects/*/package.json", { cwd: fileURLToPath(root) })) {
    const name = basename(dirname(manifest));
    const projectOutput = new URL(`projects/${name}/dist/${mode}/`, root);
    const files = await readdir(projectOutput, { withFileTypes: true });
    if (mode === "portable") {
        if (files.length !== 1 || files[0]?.name !== `${name}.html` || !files[0].isFile()) {
            throw new Error(`${name}: portable output must contain exactly one HTML file`);
        }
    } else {
        if (!files.some((file) => file.isFile() && file.name === "index.html")) {
            throw new Error(`${name}: Web entry was not generated`);
        }
        pageUrls.push(new URL(`${encodeURIComponent(name)}/`, siteUrl).href);
    }
    projects.push({ name, output: projectOutput });
}

// Rebuild only the selected delivery, preserving the other build and preview watchers.
await mkdir(output, { recursive: true });
for (const entry of await readdir(output)) {
    await rm(join(fileURLToPath(output), entry), { recursive: true, force: true });
}
if (mode === "web") {
    await cp(new URL("public/", root), output, { recursive: true });
    await cp(new URL("shared/icons/", root), new URL("shared/icons/", output), { recursive: true });
    await cp(new URL("index.html", root), new URL("index.html", output));
    await cp(new URL("LICENSE.txt", root), new URL("LICENSE.txt", output));
    await mkdir(new URL("src/", output), { recursive: true });
    await cp(new URL("src/styles.css", root), new URL("src/styles.css", output));
}

// Each workspace owns conversion; the collection only assembles its final assets.
for (const project of projects) {
    if (mode === "portable") {
        await cp(new URL(`${project.name}.html`, project.output), new URL(`${project.name}.html`, output));
    } else {
        await cp(project.output, new URL(`${project.name}/`, output), { recursive: true });
    }
}

if (mode === "web") {
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pageUrls.map((url) => `    <url><loc>${url.replaceAll("&", "&amp;")}</loc></url>`).join("\n")}
</urlset>
`;
    await writeFile(new URL("sitemap.xml", output), sitemap);
    await writeFile(
        new URL("robots.txt", output),
        `User-agent: *\nAllow: /\n\nSitemap: ${new URL("sitemap.xml", siteUrl).href}\n`
    );
}

console.log(`Built Playground ${mode} into ${fileURLToPath(output)}`);
