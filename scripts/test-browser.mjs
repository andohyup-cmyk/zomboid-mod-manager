import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const cli = join(dirname(createRequire(import.meta.url).resolve("playwright/package.json")), "cli.js");
for (const mode of ["preview", "approved"]) {
  const result = spawnSync(process.execPath, [cli, "test", ...process.argv.slice(2)], {
    stdio: "inherit",
    env: { ...process.env, BROWSER_TEST_MODE: mode }
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
