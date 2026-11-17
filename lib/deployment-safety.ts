/**
 * Fail closed when the deployment is not explicitly the Vercel production environment.
 * This is a safeguard against accidental app/API writes from previews, not database isolation:
 * a signed-in user can still call Supabase directly if the same project is shared.
 * Use a separate Supabase project for integration tests.
 */
export function isReadOnlyDeployment(vercelEnv: string | undefined): boolean {
  return vercelEnv !== "production";
}
