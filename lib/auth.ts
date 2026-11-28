import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export const getOwnerAccess = cache(async function getOwnerAccess() {
  const supabase = await createClient();
  if (!supabase) return { kind: "unconfigured" } as const;

  const [
    { data: { user }, error },
    { data: allowed, error: permissionError }
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc("is_authorized_user")
  ]);
  if (error || !user) return { kind: "signed-out" } as const;
  if (permissionError) return { kind: "permission-setup", userId: user.id } as const;
  if (allowed !== true) return { kind: "denied", userId: user.id } as const;

  return { kind: "authorized", supabase, user } as const;
});
