import "server-only";
import { cookies } from "next/headers";
import { createServerClient, isChunkLike } from "@supabase/ssr";

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function getSupabaseAuthCookieName(url: string): string {
  const projectRef = new URL(url).hostname.split(".")[0];
  return `sb-${projectRef}-auth-token`;
}

export async function createClient(options?: { ignoreExistingSession?: boolean }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const store = await cookies();
  const sessionCookie = options?.ignoreExistingSession ? getSupabaseAuthCookieName(url) : null;
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        const all = store.getAll();
        if (!sessionCookie) return all;

        // Prevent an old session refresh during exchange. Keep cookie names for chunk cleanup.
        return all.map((cookie) => isChunkLike(cookie.name, sessionCookie)
          ? { name: cookie.name, value: "" }
          : cookie);
      },
      setAll(items) {
        try {
          items.forEach(({ name, value, options }) => store.set(name, value, options));
        } catch {
          // Server Components may only read cookies; proxy.ts refreshes sessions.
        }
      }
    }
  });
}
