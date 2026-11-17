import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function noStoreRedirect(destination: URL) {
  const response = NextResponse.redirect(destination);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (code) {
    const supabase = await createClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return noStoreRedirect(new URL("/dashboard", request.url));
    }
  }
  return noStoreRedirect(new URL("/login?error=oauth", request.url));
}
