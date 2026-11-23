import Link from "next/link";
import { getOwnerAccess } from "@/lib/auth";

export default async function DashboardPage() {
  const access = await getOwnerAccess();
  if (access.kind !== "authorized") return null;

  const owner = access.user.id;
  const [mods, profiles, unverified, primaries] = await Promise.all([
    access.supabase.from("mods").select("id", { count: "exact", head: true })
      .eq("owner_id", owner).eq("is_archived", false),
    access.supabase.from("profiles").select("id", { count: "exact", head: true }),
    access.supabase.from("mods").select("id", { count: "exact", head: true })
      .eq("owner_id", owner).eq("is_archived", false).eq("build_compatibility", "unverified"),
    access.supabase.from("mod_category_primary").select("mod_id", { count: "exact", head: true })
      .eq("owner_id", owner)
  ]);
  const total = mods.count ?? null;
  const unclassified = total !== null && primaries.count !== null && !primaries.error
    ? Math.max(total - primaries.count, 0) : null;
  const stats: { label: string; value: number | null; href: string }[] = [
    { label: "등록된 모드", value: total, href: "/mods" },
    { label: "서버 프로필", value: profiles.count ?? null, href: "/profiles" },
    { label: "B42.22 미확인", value: unverified.error ? null : (unverified.count ?? null), href: "/mods?build=unverified" },
    { label: "미분류 (추정)", value: unclassified, href: "/mods" }
  ];

  return (
    <div className="space-y-5">
      <div>
        <p className="kicker">BUILD 42.22</p>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">모드 관리</h1>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {stats.map(item => (
          <Link key={item.label} href={item.href} className="panel block p-4 transition active:border-[#8fcb85] hover:border-[#8fcb85]">
            <p className="muted text-xs">{item.label}</p>
            <p className="mt-1 text-3xl font-black tabular-nums">{item.value ?? "—"}</p>
          </Link>
        ))}
      </div>
      {(mods.error || profiles.error) && (
        <p className="rounded-xl border border-amber-700/50 p-4 text-sm text-amber-200">
          데이터 조회에 문제가 있습니다. Supabase 마이그레이션 및 접근 권한을 확인하세요.
        </p>
      )}
      <section className="space-y-2">
        <h2 className="text-lg font-bold">빠른 시작</h2>
        <Link href="/register" className="panel block p-4 transition active:border-[#8fcb85] hover:border-[#8fcb85]">
          <p className="font-bold">새 모드 등록</p>
          <p className="muted mt-1 text-sm">Workshop 링크·ID를 검토한 뒤 등록합니다.</p>
        </Link>
        <Link href="/mods" className="panel block p-4 transition active:border-[#8fcb85] hover:border-[#8fcb85]">
          <p className="font-bold">카탈로그 보기</p>
          <p className="muted mt-1 text-sm">Mod ID와 호환성 검증 상태를 확인합니다.</p>
        </Link>
        <Link href="/profiles" className="panel block p-4 transition active:border-[#8fcb85] hover:border-[#8fcb85]">
          <p className="font-bold">서버 프로필</p>
          <p className="muted mt-1 text-sm">서버별 Mod ID 조합을 편집·보관합니다.</p>
        </Link>
      </section>
    </div>
  );
}
