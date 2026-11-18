import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

function noStoreRedirect(destination: URL) {
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

// Temporary preview-only diagnostics. Never log auth codes, tokens or cookie values.
function reportOAuthFailure(
  reason: string,
  details?: { status?: number; code?: string; name?: string; verifierCookiePresent?: boolean }
) {
  if (process.env.VERCEL_ENV !== "preview") return;
  console.error("[preview-oauth-diagnostic]", {
    reason,
    status: details?.status ?? null,
    errorCode: details?.code ?? null,
    errorName: details?.name ?? null,
    verifierCookiePresent: details?.verifierCookiePresent ?? null
  });
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    reportOAuthFailure("missing_code");
    return noStoreRedirect(new URL("/login?error=oauth", request.url));
  }

  const supabase = await createClient();
  if (!supabase) {
    reportOAuthFailure("missing_supabase_configuration");
    return noStoreRedirect(new URL("/login?error=oauth", request.url));
  }

  // Log presence only, not cookie names or values. PKCE verifier is kept in an SSR cookie.
  const cookieStore = await cookies();
  const verifierCookiePresent = cookieStore.getAll().some(({ name }) =>
    name.includes("auth-token-code-verifier")
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) return noStoreRedirect(new URL("/dashboard", request.url));

  reportOAuthFailure("exchange_code_for_session_failed", {
    status: error.status,
    code: error.code,
    name: error.name,
    verifierCookiePresent
  });
  return noStoreRedirect(new URL("/login?error=oauth", request.url));
}
