import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const output = new URL("dist/", root);
const [template, styles, engine, app] = await Promise.all(
    ["index.html", "styles.css", "engine.js", "app.js"].map((file) => readFile(new URL(file, root), "utf8"))
);

// Replacement callbacks preserve literal $ characters in source code.
// Inline scripts run after the page markup, retaining their original order.
const html = template
    .replace('<link rel="stylesheet" href="styles.css">', () => `<style>\n${styles}\n</style>`)
    .replace(/ {2}<script src="(?:engine|app)\.js" defer><\/script>\r?\n/g, "")
    .replace("</body>", () => `<script>\n${engine}\n</script>\n<script>\n${app}\n</script>\n</body>`);

// Online and downloadable files are identical, self-contained documents.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await writeFile(new URL("index.html", output), html);
await writeFile(new URL("tiny-bay.html", output), html);

console.log(`Built Tiny Bay into ${fileURLToPath(output)}`);
