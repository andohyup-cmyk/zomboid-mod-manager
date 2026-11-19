import Link from "next/link";
import { getOwnerAccess } from "@/lib/auth";

export default async function ProfilesPage() {
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return null;
  const { data, error } = await access.supabase
    .from("profiles")
    .select("id,name,created_at")
    .order("created_at", { ascending: false });

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">서버 프로필</h1>
        <Link href="/profiles/editor" className="action text-sm">Mod ID 임시 편집</Link>
      </div>
      {error && <p className="text-sm text-red-300">프로필 목록을 불러오지 못했습니다.</p>}
      {!error && data?.length === 0 && (
        <div className="panel p-7">
          <p className="font-semibold">등록된 서버 프로필이 없습니다.</p>
        </div>
      )}
      <div className="grid gap-3">
        {data?.map((profile) => (
          <div key={profile.id} className="panel p-5">
            <p className="font-bold">{profile.name}</p>
            <p className="muted mt-2 text-xs">개별 Mod ID 선택과 출력은 임시 편집 화면에서 확인할 수 있습니다.</p>
          </div>
        ))}
      </div>
    </section>
  );
}
