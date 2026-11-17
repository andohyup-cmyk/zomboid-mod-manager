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
      <p className="kicker">SERVER PROFILES</p>
      <h1 className="text-3xl font-bold">서버 프로필</h1>
      <p className="muted text-sm leading-6">서버마다 사용할 모드를 독립적으로 선택하고, 순서를 관리할 예정입니다.</p>
      {error && <p className="text-sm text-red-300">프로필 목록을 불러오지 못했습니다.</p>}
      {!error && data?.length === 0 && (
        <div className="panel p-7">
          <p className="font-semibold">등록된 서버 프로필이 없습니다.</p>
          <p className="muted mt-2 text-sm">이 화면은 초기 구조만 준비된 상태입니다. 생성·선택·출력 기능은 다음 개발 단계에서 구현합니다.</p>
        </div>
      )}
      <div className="grid gap-3">
        {data?.map((profile) => (
          <div key={profile.id} className="panel p-5">
            <p className="font-bold">{profile.name}</p>
            <p className="muted mt-2 text-xs">서버 설정 출력 기능은 아직 구현되지 않았습니다.</p>
          </div>
        ))}
      </div>
    </section>
  );
}
