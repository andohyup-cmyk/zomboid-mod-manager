import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

test("the OAuth callback keeps its verifier when an old session has expired", async (t) => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test-project.example";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = randomUUID();

  t.mock.method(console, "warn", () => {});
  const refresh = t.mock.method(globalThis, "fetch", async () =>
    Response.json({ code: "refresh_token_not_found" }, {
      status: 401,
      headers: { "X-Supabase-Api-Version": "2024-01-01" }
    })
  );
  const storageKey = "sb-test-project-auth-token";
  const verifier = randomUUID();
  const oldSession = Buffer.from(JSON.stringify({
    access_token: randomUUID(),
    refresh_token: randomUUID(),
    expires_at: Math.floor(Date.now() / 1000) - 60
  })).toString("base64url");

  function createRequest(pathname: string) {
    const request = new NextRequest(`https://preview.example${pathname}`);
    request.cookies.set(storageKey, `base64-${oldSession}`);
    request.cookies.set(`${storageKey}-code-verifier`, verifier);
    return request;
  }

  const callback = createRequest("/auth/callback");
  await proxy(callback);
  assert.equal(refresh.mock.callCount(), 0);
  assert.ok(callback.cookies.get(`${storageKey}-code-verifier`)?.value === verifier);

  await proxy(createRequest("/dashboard"));
  assert.equal(refresh.mock.callCount(), 1);
});
