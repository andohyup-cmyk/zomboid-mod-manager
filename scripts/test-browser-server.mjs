// Loopback-only Supabase fixture for the real Next.js pages and route handlers.
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:https";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";

const approved = process.env.BROWSER_TEST_MODE === "approved";
const origin = "https://127.0.0.1:3173";
const owner = "00000000-0000-4000-8000-000000000001";
const catalog = [
  { title: "Fixture library", workshop_id: "12345", mod_ids: [
    { id: "00000000-0000-4000-8000-000000000011", value: "Core" },
    { id: "00000000-0000-4000-8000-000000000012", value: "Options" }
  ] },
  { title: "Fixture patch", workshop_id: "67890", mod_ids: [
    { id: "00000000-0000-4000-8000-000000000013", value: "Patch" }
  ] }
];
const dir = mkdtempSync(join(tmpdir(), "zomboid-browser-test-"));
const cert = join(dir, "cert.pem");
const key = join(dir, "key.pem");
process.on("exit", () => rmSync(dir, { recursive: true, force: true }));
execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
  "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1",
  "-keyout", key, "-out", cert], { stdio: "ignore" });
const approvals = [];
const fixture = createServer({ cert: readFileSync(cert), key: readFileSync(key) }, async (req, res) => {
  const url = new URL(req.url, origin);
  const reply = (value, status = 200) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(value));
  };
  if (url.pathname === "/test/approvals" && req.method === "GET") return reply(approvals);
  if (req.headers.apikey !== "local-browser-test" || !req.headers.authorization?.startsWith("Bearer ")) {
    return reply({ message: "Fixture session required" }, 401);
  }
  switch (req.method + " " + url.pathname) {
    case "GET /auth/v1/user":
      return reply({ id: owner, email: "owner@example.test", aud: "authenticated", role: "authenticated" });
    case "POST /rest/v1/rpc/is_authorized_user":
      return reply(true);
    case "GET /rest/v1/mods":
      if (url.searchParams.get("select") === "workshop_id") {
        return reply(approvals.map(item => ({ workshop_id: item.workshopId })));
      }
      if (url.searchParams.get("owner_id") !== "eq." + owner || url.searchParams.get("is_archived") !== "eq.false") {
        return reply({ message: "Missing owner or archive filter" }, 400);
      }
      res.setHeader("Content-Range", `0-${catalog.length - 1}/${catalog.length}`);
      return reply(catalog);
    case "POST /rest/v1/rpc/approve_research_record": {
      let body = "";
      for await (const chunk of req) body += chunk;
      const record = JSON.parse(body).p_payload;
      approvals.push(record);
      return reply("00000000-0000-4000-8000-000000000099");
    }
    default:
      return reply({ message: "Unknown fixture route" }, 404);
  }
});
await new Promise((resolve, reject) => fixture.once("error", reject).listen(3173, "127.0.0.1", resolve));
const deployment = approved ? "production" : "preview";
const next = spawn(process.execPath, [createRequire(import.meta.url).resolve("next/dist/bin/next"),
  "dev", "--webpack", "--hostname", "127.0.0.1", "--port", "3172"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "development", NODE_EXTRA_CA_CERTS: cert, NEXT_TELEMETRY_DISABLED: "1",
    NEXT_PUBLIC_SUPABASE_URL: origin, NEXT_PUBLIC_SUPABASE_ANON_KEY: "local-browser-test",
    VERCEL_ENV: deployment, VERCEL_TARGET_ENV: deployment, VERCEL_PROJECT_ID: "browser-test",
    CATALOG_WRITE_PRODUCTION_VERCEL_PROJECT_ID: "browser-test", CATALOG_WRITE_PRODUCTION_SUPABASE_ORIGIN: origin
  }
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => { next.kill(signal); });
}
next.on("exit", code => {
  fixture.closeAllConnections();
  fixture.close();
  process.exitCode = code ?? 1;
});
