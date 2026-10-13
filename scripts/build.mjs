import { cp, glob, mkdir, readdir, rm } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const output = new URL("dist/", root);

// Keep the output directory itself so preview watchers remain attached on Windows.
await mkdir(output, { recursive: true });
for (const entry of await readdir(output)) {
    await rm(join(fileURLToPath(output), entry), { recursive: true, force: true });
}
await cp(new URL("public/", root), output, { recursive: true });
await cp(new URL("index.html", root), new URL("index.html", output));
await mkdir(new URL("src/", output), { recursive: true });
await cp(new URL("src/styles.css", root), new URL("src/styles.css", output));

// Each project owns its build; the collection only publishes its resulting assets.
for await (const manifest of glob("projects/*/package.json", { cwd: fileURLToPath(root) })) {
    const name = basename(dirname(manifest));
    await cp(new URL(`projects/${name}/dist/`, root), new URL(`${name}/`, output), { recursive: true });
}

console.log(`Built Playground into ${fileURLToPath(output)}`);
