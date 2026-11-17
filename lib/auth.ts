import "server-only";
import { createClient } from "@/lib/supabase/server";

export async function getOwnerAccess() {
  const supabase = await createClient();
  if (!supabase) return { kind: "unconfigured" } as const;

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { kind: "signed-out" } as const;

  const { data: allowed, error: permissionError } = await supabase.rpc("is_authorized_user");
  if (permissionError) return { kind: "permission-setup", userId: user.id } as const;
  if (allowed !== true) return { kind: "denied", userId: user.id } as const;

  return { kind: "authorized", supabase, user } as const;
}
