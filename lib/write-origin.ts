/**
 * Reject authenticated browser writes originating from a different site.
 * No Origin is permitted for non-browser clients; auth and RLS are still required.
 * This complements, never replaces, server-side authorization and CSRF-safe cookies.
 */
export function isSameOriginRequest(requestUrl: string, originHeader: string | null): boolean {
  if (originHeader === null) return true;
  try {
    const requested = new URL(requestUrl);
    const supplied = new URL(originHeader);
    return (requested.protocol === "https:" || requested.hostname === "localhost" || requested.hostname === "127.0.0.1")
      && supplied.origin === requested.origin
      && originHeader === supplied.origin;
  } catch {
    return false;
  }
}
