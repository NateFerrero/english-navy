import { cp, mkdir, rm } from "node:fs/promises";

const OUT_DIR = new URL("./dist/", import.meta.url);

await rm(OUT_DIR, { force: true, recursive: true });
await mkdir(OUT_DIR, { recursive: true });

await Promise.all([
  cp(new URL("./index.html", import.meta.url), new URL("./index.html", OUT_DIR)),
  cp(new URL("./styles.css", import.meta.url), new URL("./styles.css", OUT_DIR)),
  cp(new URL("./src/", import.meta.url), new URL("./src/", OUT_DIR), { recursive: true }),
]);
