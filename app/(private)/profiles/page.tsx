import Link from "next/link";
import { getOwnerAccess } from "@/lib/auth";
import { isCatalogWriteAllowed } from "@/lib/catalog-write-protection";
import { isTestCategoryWriteAllowed } from "@/lib/category-persistence-input";
import { isTestProfileSnapshotWriteAllowed } from "@/lib/profile-snapshot-write";
import { ProfileCreateForm } from "@/components/ProfileCreateForm";

export const dynamic = "force-dynamic";

export default async function ProfilesPage() {
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return null;
  const { data, error } = await access.supabase
    .from("profiles")
    .select("id,name,created_at")
    .eq("owner_id", access.user.id)
    .order("created_at", { ascending: false })
    .limit(100);

  const writeEnabled = isCatalogWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL)
    || isTestProfileSnapshotWriteAllowed(process.env, process.env.NEXT_PUBLIC_SUPABASE_URL)
    || isTestCategoryWriteAllowed(process.env);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">서버 프로필</h1>
        <Link href="/profiles/editor" className="action shrink-0 text-sm">Mod ID 편집</Link>
      </div>
      <ProfileCreateForm writeEnabled={writeEnabled} />
      {error && <p role="alert" className="text-sm text-red-300">프로필 목록을 불러오지 못했습니다.</p>}
      {!error && data?.length === 0 && (
        <div className="panel space-y-3 p-6 text-center">
          <p className="font-semibold">저장된 서버 프로필이 없습니다.</p>
          <p className="muted text-sm">위에서 새 서버 프로필을 만들거나, Mod ID 편집 화면에서 조합을 먼저 구성해 보세요.</p>
          <Link href="/profiles/editor" className="action inline-block text-sm">편집 시작</Link>
        </div>
      )}
      <ul className="grid gap-2">
        {data?.map((profile) => (
          <li key={profile.id}>
            <Link
              href={`/profiles/editor?profileId=${encodeURIComponent(profile.id)}`}
              className="panel flex items-center justify-between gap-3 p-4 transition-colors active:border-[#6ca67b] hover:border-[#6ca67b]"
            >
              <div className="min-w-0">
                <p className="break-words font-bold">{profile.name}</p>
                <p className="muted mt-1 text-xs">
                  생성: {String(profile.created_at).slice(0, 10)} · 눌러서 저장된 Mod ID 조합 열기
                </p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-[#b9efb0]">열기 →</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
