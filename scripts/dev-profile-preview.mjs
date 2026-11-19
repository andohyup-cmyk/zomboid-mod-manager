import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const next = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));
const preview = spawn(process.execPath, [next, "dev", "--hostname", "127.0.0.1", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "development",
    SERVER_PROFILE_PREVIEW: "1",
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
    NEXT_TELEMETRY_DISABLED: "1"
  }
});

preview.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
preview.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
