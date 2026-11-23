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
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">서버 프로필</h1>
        <Link href="/profiles/editor" className="action shrink-0 text-sm">Mod ID 편집</Link>
      </div>
      {error && <p role="alert" className="text-sm text-red-300">프로필 목록을 불러오지 못했습니다.</p>}
      {!error && data?.length === 0 && (
        <div className="panel space-y-3 p-6 text-center">
          <p className="font-semibold">저장된 서버 프로필이 없습니다.</p>
          <p className="muted text-sm">Mod ID 편집 화면에서 조합을 만들고 JSON 파일로 보관할 수 있습니다.</p>
          <Link href="/profiles/editor" className="action inline-block text-sm">편집 시작</Link>
        </div>
      )}
      <ul className="grid gap-2">
        {data?.map((profile) => (
          <li key={profile.id} className="panel p-4">
            <p className="break-words font-bold">{profile.name}</p>
            <p className="muted mt-1 text-xs">개별 Mod ID 선택과 출력은 Mod ID 편집 화면에서 확인할 수 있습니다.</p>
          </li>
        ))}
      </ul>
      <Link href="/backup" className="secondary-action block text-center text-sm">JSON 데이터 내보내기</Link>
    </section>
  );
}
