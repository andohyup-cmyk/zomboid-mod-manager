import { NextResponse, type NextRequest } from "next/server";
import { createClient, getSupabaseAuthCookieName } from "@/lib/supabase/server";

function noStoreRedirect(destination: URL) {
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

// Temporary preview-only diagnostics. Never log auth codes, tokens or cookie values.
function classifyAuthFailure(message: string): string {
  const normalized = message.toLowerCase();
  if (normalized.includes("code verifier") || normalized.includes("code_verifier")) return "code_verifier";
  if (normalized.includes("invalid flow") || normalized.includes("flow state")) return "flow_state";
  if (normalized.includes("expired") || normalized.includes("already used")) return "expired_or_reused_code";
  if (normalized.includes("invalid grant") || normalized.includes("invalid_grant")) return "invalid_grant";
  if (normalized.includes("invalid api key") || normalized.includes("invalid jwt")) return "api_key_or_jwt";
  return "unclassified";
}

function reportOAuthFailure(
  reason: string,
  details?: { status?: number; code?: string; name?: string; verifierCookiePresent?: boolean; errorCategory?: string; flowIdPresent?: boolean }
) {
  if (process.env.VERCEL_ENV !== "preview") return;
  console.error("[preview-oauth-diagnostic]", {
    reason,
    status: details?.status ?? null,
    errorCode: details?.code ?? null,
    errorName: details?.name ?? null,
    verifierCookiePresent: details?.verifierCookiePresent ?? null,
    errorCategory: details?.errorCategory ?? null,
    flowIdPresent: details?.flowIdPresent ?? null
  });
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    reportOAuthFailure("missing_code");
    return noStoreRedirect(new URL("/login?error=oauth", request.url));
  }

  const supabase = await createClient({ ignoreExistingSession: true });
  if (!supabase) {
    reportOAuthFailure("missing_supabase_configuration");
    return noStoreRedirect(new URL("/login?error=oauth", request.url));
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (!error) return noStoreRedirect(new URL("/dashboard", request.url));

  let verifierCookiePresent: boolean | undefined;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (process.env.VERCEL_ENV === "preview" && url) {
    // Exchange without a flow ID reads the fixed verifier for this project's storage key.
    const name = `${getSupabaseAuthCookieName(url)}-code-verifier`;
    verifierCookiePresent = request.cookies.has(name) || request.cookies.has(`${name}.0`);
  }

  reportOAuthFailure("exchange_code_for_session_failed", {
    status: error.status,
    code: error.code,
    name: error.name,
    verifierCookiePresent,
    errorCategory: classifyAuthFailure(error.message),
    flowIdPresent: request.nextUrl.searchParams.has("sb_flow_id")
  });
  return noStoreRedirect(new URL("/login?error=oauth", request.url));
}
