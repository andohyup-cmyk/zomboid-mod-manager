import { ProfileModEditor } from "@/components/ProfileModEditor";
import { getOwnerAccess } from "@/lib/auth";
import { isCatalogModUuid } from "@/lib/catalog-read";
import { isCatalogWriteAllowed } from "@/lib/catalog-write-protection";
import { isTestCategoryWriteAllowed } from "@/lib/category-persistence-input";
import { isTestProfileSnapshotWriteAllowed } from "@/lib/profile-snapshot-write";

export const dynamic = "force-dynamic";

const recommendationOptions = { categoryPriority: [] };

export default async function ProfileEditorPage({
  searchParams
}: {
  searchParams: Promise<{ profileId?: string }>;
}) {
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return null;

  const params = await searchParams;
  const requestedId = typeof params.profileId === "string" && isCatalogModUuid(params.profileId)
    ? params.profileId.toLowerCase()
    : null;

  const { data: profileRows } = await access.supabase
    .from("profiles")
    .select("id,name")
    .eq("owner_id", access.user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const initialProfiles = ((profileRows ?? []) as { id: string; name: string }[]).map((row) => ({
    id: row.id,
    name: row.name
  }));
  const initialProfileId = requestedId && initialProfiles.some((p) => p.id.toLowerCase() === requestedId)
    ? initialProfiles.find((p) => p.id.toLowerCase() === requestedId)?.id ?? null
    : null;

  const testWriteEnabled = isTestCategoryWriteAllowed(process.env);
  const profileWriteEnabled = testWriteEnabled
    || isTestProfileSnapshotWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL)
    || isCatalogWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL);

  return (
    <ProfileModEditor
      recommendationOptions={recommendationOptions}
      groupWriteEnabled={testWriteEnabled}
      profileWriteEnabled={profileWriteEnabled}
      initialProfiles={initialProfiles}
      initialProfileId={initialProfileId}
    />
  );
}
