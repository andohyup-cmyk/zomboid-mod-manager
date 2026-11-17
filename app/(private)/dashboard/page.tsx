import Link from "next/link";
import { getOwnerAccess } from "@/lib/auth";

export default async function DashboardPage() {
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return null;

  const [mods, profiles] = await Promise.all([
    access.supabase.from("mods").select("id", { count: "exact", head: true }).eq("is_archived", false),
    access.supabase.from("profiles").select("id", { count: "exact", head: true })
  ]);

  return (
    <div className="space-y-7">
      <div>
        <p className="kicker">MY WORKSPACE · BUILD 42.22</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">모드 관리 대시보드</h1>
        <p className="muted mt-3 text-sm">조사한 모드와 서버 구성을 한곳에서 관리합니다.</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="panel p-5">
          <p className="muted text-sm">등록된 모드</p>
          <p className="mt-2 text-4xl font-black">{mods.count ?? "—"}</p>
        </div>
        <div className="panel p-5">
          <p className="muted text-sm">서버 프로필</p>
          <p className="mt-2 text-4xl font-black">{profiles.count ?? "—"}</p>
        </div>
      </div>
      {(mods.error || profiles.error) && (
        <p className="rounded-xl border border-amber-700/50 p-4 text-sm text-amber-200">
          데이터 조회에 문제가 있습니다. Supabase 마이그레이션 및 접근 권한을 확인하세요.
        </p>
      )}
      <section className="space-y-3">
        <h2 className="text-xl font-bold">빠른 시작</h2>
        <Link href="/register" className="panel block p-5 transition hover:border-[#8fcb85]">
          <p className="font-bold">새 모드 등록</p>
          <p className="muted mt-2 text-sm">Workshop 링크 또는 AI 조사 결과를 검토한 뒤 등록합니다.</p>
        </Link>
        <Link href="/mods" className="panel block p-5 transition hover:border-[#8fcb85]">
          <p className="font-bold">카탈로그 보기</p>
          <p className="muted mt-2 text-sm">등록한 모드와 Mod ID, 호환성 검증 상태를 확인합니다.</p>
        </Link>
        <Link href="/profiles" className="panel block p-5 transition hover:border-[#8fcb85]">
          <p className="font-bold">서버 프로필</p>
          <p className="muted mt-2 text-sm">서버별 모드 조합 관리를 위한 화면입니다.</p>
        </Link>
      </section>
    </div>
  );
}
