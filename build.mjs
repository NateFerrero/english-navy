import { cp, mkdir, rm } from "node:fs/promises";

const OUT_DIR = new URL("./dist/", import.meta.url);

await rm(OUT_DIR, { force: true, recursive: true });
await mkdir(OUT_DIR, { recursive: true });

await Promise.all([
  cp(new URL("./index.html", import.meta.url), new URL("./index.html", OUT_DIR)),
  cp(new URL("./styles.css", import.meta.url), new URL("./styles.css", OUT_DIR)),
  cp(new URL("./manifest.webmanifest", import.meta.url), new URL("./manifest.webmanifest", OUT_DIR)),
  cp(new URL("./sw.mjs", import.meta.url), new URL("./sw.mjs", OUT_DIR)),
  cp(new URL("./offline.html", import.meta.url), new URL("./offline.html", OUT_DIR)),
  cp(new URL("./icons/", import.meta.url), new URL("./icons/", OUT_DIR), { recursive: true }),
  cp(new URL("./src/", import.meta.url), new URL("./src/", OUT_DIR), { recursive: true }),
]);
